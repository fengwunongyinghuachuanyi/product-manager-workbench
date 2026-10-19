#!/bin/zsh
set -eu
integration_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
compiler_dir="$integration_dir/runtime/build/compiler"
/Library/Developer/CommandLineTools/usr/bin/swiftc -Onone -swift-version 6 -target arm64-apple-macosx14.0 -parse-as-library -sdk /Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk -vfsoverlay "$integration_dir/runtime/swift-overlay/overlay.json" -module-cache-path "$integration_dir/runtime/build/module-cache" -I "$compiler_dir" -L "$compiler_dir" -lOpenPetsKit -Xlinker -rpath -Xlinker @executable_path "$integration_dir/native/CompanionPhysicsSmoke.swift" -o "$compiler_dir/companion-physics-smoke"
"$compiler_dir/companion-physics-smoke"
