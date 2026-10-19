import React, { useState } from 'react';
import { Button, InputNumber, Message, Progress, Spin, Switch } from '@arco-design/web-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import type { PetCompanionCommand } from '@/common/types/platform/pet';
import styles from './index.module.css';

/** Companion controls share one persistent main-process clock and game state. */
export default function PetCompanion(): React.ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [minutes, setMinutes] = useState(25);
  const [busy, setBusy] = useState(false);
  const { data, error, mutate } = useSWR(
    'pet.companion',
    () => {
      if (!window.electronAPI?.petCompanionState) throw new Error('Desktop companion unavailable');
      return window.electronAPI.petCompanionState();
    },
    { refreshInterval: 500, revalidateOnFocus: true }
  );
  const act = async (command: PetCompanionCommand): Promise<void> => {
    if (!window.electronAPI?.petCompanionAction || busy) return;
    setBusy(true);
    try {
      await mutate(await window.electronAPI.petCompanionAction(command), false);
    } catch {
      Message.error(t('pet.companion.actionFailed'));
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <div className={styles.panel}>
        {t('pet.companion.unavailable')}
        <Button
          onClick={() => {
            void mutate();
          }}
        >
          {t('pet.companion.retry')}
        </Button>
      </div>
    );
  if (!data) return <Spin loading />;
  const seconds = Math.max(0, Math.ceil((data.focusUntil - Date.now()) / 1000));
  const focusClock = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const gameSeconds = Math.max(0, Math.ceil((data.game.endsAt - Date.now()) / 1000));
  return (
    <div className={styles.panel}>
      <div className={styles.intro}>
        <span className={styles.eyebrow}>{t('pet.companion.panel')}</span>
        <h1>{t('pet.companion.title')}</h1>
        <p>{t('pet.companion.interactionHint')}</p>
      </div>
      <div className={styles.actions}>
        <Button
          disabled={busy}
          onClick={() => {
            void act({ action: 'pet' });
          }}
        >
          {t('pet.companion.pet')}
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void act({ action: 'feed' });
          }}
        >
          {t('pet.companion.feed')}
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            void act({ action: data.sleeping ? 'wake' : 'sleep' });
          }}
        >
          {t(data.sleeping ? 'pet.companion.wake' : 'pet.companion.sleep')}
        </Button>
        <Button
          type='primary'
          onClick={() => {
            void navigate('/guid');
          }}
        >
          {t('pet.companion.chat')}
        </Button>
      </div>
      <section className={styles.section}>
        <div className={styles.row}>
          <strong>{t('pet.companion.fullness')}</strong>
          <span>{Math.round(data.fullness)} / 100</span>
        </div>
        <Progress percent={data.fullness} showText={false} />
        <p>
          {data.message ||
            t(
              data.sleeping
                ? 'pet.companion.sleeping'
                : data.mode === 'focus'
                  ? 'pet.companion.focusing'
                  : 'pet.companion.company'
            )}
        </p>
      </section>
      <section className={styles.section}>
        <div className={styles.row}>
          <strong>{t('pet.companion.focus')}</strong>
          <span className={styles.clock}>{data.focusUntil ? focusClock : t('pet.companion.ready')}</span>
        </div>
        <div className={styles.actions}>
          <InputNumber
            aria-label={t('pet.companion.minutes')}
            min={1}
            max={120}
            value={minutes}
            onChange={(value) => setMinutes(value || 25)}
            disabled={data.mode === 'focus'}
          />
          <span>{t('pet.companion.minutes')}</span>
          <Button
            disabled={busy}
            onClick={() => {
              void act(data.mode === 'focus' ? { action: 'stop-focus' } : { action: 'focus', minutes });
            }}
          >
            {t(data.mode === 'focus' ? 'pet.companion.stopFocus' : 'pet.companion.startFocus')}
          </Button>
        </div>
        <p>{t('pet.companion.focusHint', { count: data.focusCount })}</p>
      </section>
      <section className={styles.section}>
        <div className={styles.row}>
          <strong>{t('pet.companion.game')}</strong>
          <span>{t('pet.companion.best', { score: data.game.best })}</span>
        </div>
        <p>{t('pet.companion.gameHint')}</p>
        <div className={styles.board}>
          {data.game.running ? (
            <Button
              className={styles.token}
              type='primary'
              shape='circle'
              aria-label={t('pet.companion.catch')}
              style={{ left: `${data.game.x * 100}%`, top: `${data.game.y * 100}%` }}
              onClick={() => {
                void act({ action: 'game-catch', tokenId: data.game.tokenId });
              }}
            >
              🍚
            </Button>
          ) : (
            <span>{t('pet.companion.gameIdle', { score: data.game.score })}</span>
          )}
        </div>
        <div className={styles.row}>
          <span>
            {t('pet.companion.score', { score: data.game.score, seconds: data.game.running ? gameSeconds : 30 })}
          </span>
          <Button
            disabled={busy}
            onClick={() => {
              void act({ action: data.game.running ? 'game-stop' : 'game-start' });
            }}
          >
            {t(data.game.running ? 'pet.companion.stopGame' : 'pet.companion.startGame')}
          </Button>
        </div>
      </section>
      <section className={styles.section}>
        <div className={styles.row}>
          <strong>{t('pet.companion.follow')}</strong>
          <Switch
            aria-label={t('pet.companion.follow')}
            checked={data.following}
            disabled={busy}
            onChange={(enabled) => {
              void act({ action: 'follow', enabled });
            }}
          />
        </div>
        <p>{t('pet.companion.followHint')}</p>
        <Button
          disabled={busy}
          onClick={() => {
            void act({ action: 'perch' });
          }}
        >
          {t('pet.companion.perch')}
        </Button>
        <div className={styles.row}>
          <strong>{t('pet.companion.quiet')}</strong>
          <Switch
            aria-label={t('pet.companion.quiet')}
            checked={data.mode === 'quiet'}
            disabled={busy}
            onChange={(enabled) => {
              void act({ action: enabled ? 'quiet' : 'company' });
            }}
          />
        </div>
        <p>{t('pet.companion.quietHint')}</p>
      </section>
    </div>
  );
}
