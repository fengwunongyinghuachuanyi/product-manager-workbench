#!/bin/zsh
set -eu
integration_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
runtime_dir="$integration_dir/runtime/build/compiler"
app_dir="$integration_dir/runtime/WorkbenchPet.app/Contents"
sdk_path=/Library/Developer/CommandLineTools/SDKs/MacOSX15.5.sdk
mkdir -p "$runtime_dir/OpenPetsKit_OpenPetsKit.bundle" "$integration_dir/runtime/build/module-cache" "$app_dir/MacOS" "$app_dir/Resources/Pets/deepseek"
cp "$integration_dir/kit/Sources/OpenPetsKit/Resources/Pets/starcorn/"* "$runtime_dir/OpenPetsKit_OpenPetsKit.bundle/"
export SDKROOT="$sdk_path"
/Library/Developer/CommandLineTools/usr/bin/swiftc \
  -O -swift-version 6 -target arm64-apple-macosx14.0 -parse-as-library \
  -vfsoverlay "$integration_dir/runtime/swift-overlay/overlay.json" \
  -module-cache-path "$integration_dir/runtime/build/module-cache" \
  -emit-library -emit-module -enable-testing -module-name OpenPetsKit \
  -Xlinker -install_name -Xlinker @rpath/libOpenPetsKit.dylib \
  "$integration_dir/kit/Sources/OpenPetsKit/"*.swift "$integration_dir/native/ResourceBundle.swift" \
  -emit-module-path "$runtime_dir/OpenPetsKit.swiftmodule" \
  -o "$runtime_dir/libOpenPetsKit.dylib"
/Library/Developer/CommandLineTools/usr/bin/swiftc \
  -O -swift-version 6 -target arm64-apple-macosx14.0 -parse-as-library \
  -vfsoverlay "$integration_dir/runtime/swift-overlay/overlay.json" \
  -module-cache-path "$integration_dir/runtime/build/module-cache" \
  -I "$runtime_dir" -L "$runtime_dir" -lOpenPetsKit \
  -Xlinker -rpath -Xlinker @executable_path \
  "$integration_dir/native/Sources/WorkbenchPet/"*.swift \
  -o "$runtime_dir/workbench-pet"
for binary_name in workbench-pet libOpenPetsKit.dylib; do
  cp "$runtime_dir/$binary_name" "$app_dir/MacOS/$binary_name.next"
  mv -f "$app_dir/MacOS/$binary_name.next" "$app_dir/MacOS/$binary_name"
done
cp -R "$runtime_dir/OpenPetsKit_OpenPetsKit.bundle" "$app_dir/MacOS/"
cp "$integration_dir/native/Info.plist" "$app_dir/Info.plist"
cp -R "$integration_dir/pets/deepseek/"* "$app_dir/Resources/Pets/deepseek/"
