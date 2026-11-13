require 'xcodeproj'
require 'fileutils'
root = File.expand_path('../..', __dir__)
destination = File.join(root, '.private/iphone/DairyOSPhone.xcodeproj')
FileUtils.rm_rf(destination) if File.exist?(destination)
project = Xcodeproj::Project.new(destination)
target = project.new_target(:application, 'DairyOSPhone', :ios, '17.0')
target.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, 'native/iphone/DairyOSApp.swift')))
target.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, 'native/iphone/Bluetooth.swift')))
target.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, 'native/iphone/BLETelemetry.swift')))
target.source_build_phase.add_file_reference(project.main_group.new_file(File.join(root, 'native/iphone/BLEAttemptState.swift')))
resources = [[File.join(root, 'native/iphone/performance-test.js'), nil], [File.join(root, 'dist'), 'Web'], [File.join(root, '.private/iphone/worker.bundle'), nil], [File.join(root, '.private/iphone/starter-library.json'), nil], [File.join(root, 'native/iphone/self-test.js'), nil], [File.join(root, 'native/iphone/bulb1-test.js'), nil], [File.join(root, 'native/iphone/reconnect-test.js'), nil], [File.join(root, 'native/iphone/semantic-test.js'), nil], [File.join(root, 'native/iphone/sensor-chat-test.js'), nil], [File.join(root, 'native/iphone/automatic-ble-test.js'), nil], [File.join(root, 'native/iphone/chat-feedback-test.js'), nil], [File.join(root, 'native/iphone/duration-test.js'), nil], [File.join(root, 'native/iphone/Assets.xcassets'), nil], [File.join(root, '.private/photo-checks/leaf-b.jpg'), 'test-leaf.jpg']]
resources.each do |source, name|
  if name
    copied = File.join(root, '.private/iphone', name)
    FileUtils.rm_rf(copied) if File.exist?(copied)
    FileUtils.cp_r(source, copied)
    source = copied
  end
  ref = project.main_group.new_file(source)
  ref.last_known_file_type = 'folder.assetcatalog' if source.end_with?('.xcassets')
  ref.last_known_file_type = 'folder' if File.directory?(source) && !source.end_with?('.xcassets')
  target.resources_build_phase.add_file_reference(ref)
end
frameworks = Dir[File.join(root, '.private/iphone/addons/*.framework')]
raise 'Run npm run prepare:iphone to link native QVAC addons first' if frameworks.empty?
frameworks.unshift(File.join(root, 'node_modules/react-native-bare-kit/ios/BareKit.xcframework/ios-arm64/BareKit.framework'))
embed = target.new_copy_files_build_phase('Embed Native QVAC Frameworks'); embed.dst_subfolder_spec = '10'
frameworks.each do |framework|
  ref = project.main_group.new_file(framework)
  target.frameworks_build_phase.add_file_reference(ref)
  build = embed.add_file_reference(ref); build.settings = { 'ATTRIBUTES' => ['CodeSignOnCopy', 'RemoveHeadersOnCopy'] }
end
team = File.read(File.join(root, '.private/signing-team.txt')).strip
raise 'Existing local signing team required' if team.empty?
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.emmanuelhaggai.dairyos.local', 'PRODUCT_NAME' => 'DairyOSPhone',
    'GENERATE_INFOPLIST_FILE' => 'YES', 'INFOPLIST_KEY_CFBundleDisplayName' => 'DairyOS Local',
    'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES', 'INFOPLIST_KEY_UIApplicationSceneManifest_Generation' => 'YES',
    'INFOPLIST_KEY_UIFileSharingEnabled' => 'YES', 'INFOPLIST_KEY_LSSupportsOpeningDocumentsInPlace' => 'YES',
    'INFOPLIST_KEY_NSBluetoothAlwaysUsageDescription' => 'Read farm sensors and control your paired DairyOS board nearby, without internet.',
    'INFOPLIST_KEY_NSCameraUsageDescription' => 'Take a farm photo for analysis entirely on this iPhone.',
    'INFOPLIST_KEY_ITSAppUsesNonExemptEncryption' => 'NO', 'IPHONEOS_DEPLOYMENT_TARGET' => '17.0',
    'SWIFT_VERSION' => '5.0', 'SWIFT_OBJC_BRIDGING_HEADER' => File.join(root, 'native/iphone/Bridge.h'),
    'TARGETED_DEVICE_FAMILY' => '1', 'CODE_SIGN_STYLE' => 'Automatic', 'DEVELOPMENT_TEAM' => team,
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks'],
    'FRAMEWORK_SEARCH_PATHS' => ['$(inherited)'] + frameworks.map { |f| File.dirname(f) },
    'ASSETCATALOG_COMPILER_APPICON_NAME' => 'AppIcon', 'INFOPLIST_KEY_UIUserInterfaceStyle' => 'Light',
    'CURRENT_PROJECT_VERSION' => '24', 'MARKETING_VERSION' => '0.6.4'
  })
end
project.save
