import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('blueprint_bridge', ROOT / 'bridge.py')
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)


class BridgeTests(unittest.TestCase):
    def test_strict_schema_does_not_modify_engine_schema(self):
        from blueprint.schema import EXTRACT_SCHEMA
        before = json.dumps(EXTRACT_SCHEMA, sort_keys=True)
        converted = bridge.strict_schema(EXTRACT_SCHEMA)
        self.assertEqual(before, json.dumps(EXTRACT_SCHEMA, sort_keys=True))
        features = converted['properties']['features']
        self.assertEqual(set(features['properties']), {f.id for f in bridge.FEATURES})
        self.assertFalse(features['additionalProperties'])
        self.assertEqual(set(converted['required']), set(converted['properties']))

    def test_real_transport_contract_and_durable_budget(self):
        with tempfile.TemporaryDirectory() as tmp:
            def invoke(cmd, **kwargs):
                self.assertIn('read-only', cmd)
                self.assertIn('--ignore-user-config', cmd)
                self.assertIn('--ephemeral', cmd)
                Path(cmd[cmd.index('-o') + 1]).write_text('{"ok":true}')
                return subprocess.CompletedProcess(cmd, 0, '{"type":"turn.completed","usage":{"input_tokens":21,"output_tokens":9}}\n', '')
            settings = {**bridge.config(), 'max_calls': 1}
            runner = bridge.CodexRunner(tmp, settings, invoke)
            schema = {'type': 'object', 'required': ['ok'], 'properties': {'ok': {'type': 'boolean'}}}
            self.assertEqual(runner.complete('test', 'system', 'prompt', schema), {'ok': True})
            resumed = bridge.CodexRunner(tmp, settings, invoke)
            self.assertEqual(resumed.budget.input_tokens, 21)
            self.assertEqual(resumed.budget.output_tokens, 9)
            with self.assertRaises(bridge.BudgetExceeded):
                resumed.complete('test', 'system', 'prompt', schema)

    def test_failure_consumes_attempt_and_records_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            runner = bridge.CodexRunner(tmp, bridge.config(), lambda *a, **k: subprocess.CompletedProcess(a, 1, '', 'not signed in'))
            with self.assertRaisesRegex(RuntimeError, 'not signed in'):
                runner.complete('test', '', '', {'type': 'object'})
            self.assertEqual(bridge.read_json(Path(tmp) / 'usage.json')['calls'], 1)

    def test_aborted_call_remains_counted_on_resume(self):
        with tempfile.TemporaryDirectory() as tmp:
            bridge.save(Path(tmp) / 'usage.json', {'calls': 1, 'history': [{'stage': 'review', 'state': 'started'}]})
            runner = bridge.CodexRunner(tmp, bridge.config())
            self.assertEqual(runner.budget.calls, 1)
            self.assertEqual(runner.budget.history[0]['state'], 'interrupted')
            self.assertTrue(runner.budget.history[0]['usage_unreported'])

    def test_timeout_keeps_ledger(self):
        def timeout(*args, **kwargs):
            raise subprocess.TimeoutExpired('codex', 1)
        with tempfile.TemporaryDirectory() as tmp:
            runner = bridge.CodexRunner(tmp, bridge.config(), timeout)
            with self.assertRaisesRegex(RuntimeError, '超时'):
                runner.complete('test', '', '', {'type': 'object'})
            self.assertEqual(bridge.read_json(Path(tmp) / 'usage.json')['history'][0]['state'], 'timeout')

    def test_invalid_output_retries_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            def invoke(cmd, **kwargs):
                Path(cmd[cmd.index('-o') + 1]).write_text('{}')
                return subprocess.CompletedProcess(cmd, 0, '', '')
            runner = bridge.CodexRunner(tmp, bridge.config(), invoke)
            with self.assertRaises(bridge.StageOutputInvalid):
                runner.complete('test', '', '', {'type': 'object', 'required': ['ok']})
            self.assertEqual(runner.budget.calls, 2)

    def test_no_path_traversal(self):
        for invalid in ['../config.json', '', 'not-a-job', 'a' * 13]:
            with self.assertRaises(ValueError):
                bridge.job_directory(invalid)

    def test_original_pipeline_reuses_only_valid_stage_cache(self):
        from blueprint.mock import MockRunner
        with tempfile.TemporaryDirectory() as tmp:
            directory = Path(tmp)
            bridge.run_plan('会议需求整理助手', MockRunner(), directory, log=lambda _: None)
            resumed = MockRunner()
            bridge.run_plan('会议需求整理助手', resumed, directory, resume=True, log=lambda _: None)
            self.assertEqual(resumed.calls, [])
            (directory / 'stages/design.json').write_text('{}')
            repaired = MockRunner()
            bridge.run_plan('会议需求整理助手', repaired, directory, resume=True, log=lambda _: None)
            self.assertEqual(repaired.calls, ['design'])

    def test_original_reverse_pipeline_writes_reports(self):
        from blueprint.mock import MockRunner
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'artifacts'
            result, _ = bridge.run_audit(ROOT / 'engine/evals/reverse/minimal-bot', MockRunner(), output,
                                         log=lambda _: None)
            self.assertIn('completion', result.to_dict())
            self.assertTrue((output / '差距报告.md').is_file())
            self.assertTrue((output / '本该有的PRD.md').is_file())

    def test_bundled_source_matches_original_manifest(self):
        import hashlib
        manifest = bridge.read_json(ROOT / 'skill/source-manifest.json')
        for relative, digest in manifest['sha256'].items():
            self.assertEqual(hashlib.sha256((ROOT / 'engine' / relative).read_bytes()).hexdigest(), digest, relative)


if __name__ == '__main__':
    unittest.main()
