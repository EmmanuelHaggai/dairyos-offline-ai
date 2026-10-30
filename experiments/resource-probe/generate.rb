require 'xcodeproj'
require 'fileutils'
root = File.expand_path(__dir__)
project_path = File.join(root, 'ResourceProbe.xcodeproj')
FileUtils.rm_rf(project_path) if File.exist?(project_path)
project = Xcodeproj::Project.new(project_path)
target = project.new_target(:application, 'ResourceProbe', :ios, '16.0')
target.source_build_phase.add_file_reference(project.main_group.new_file('ResourceApp.swift'))
team = File.read(File.expand_path('../../.private/signing-team.txt', root)).strip
raise 'An existing signing team is required.' if team.empty?
target.build_configurations.each do |config|
  config.build_settings.merge!({
    'PRODUCT_BUNDLE_IDENTIFIER' => 'com.emmanuelhaggai.dairyos.local',
    'PRODUCT_NAME' => 'ResourceProbe', 'GENERATE_INFOPLIST_FILE' => 'YES',
    'INFOPLIST_KEY_CFBundleDisplayName' => 'DairyOS Check',
    'INFOPLIST_KEY_UILaunchScreen_Generation' => 'YES',
    'INFOPLIST_KEY_UIApplicationSceneManifest_Generation' => 'YES',
    'INFOPLIST_KEY_UIFileSharingEnabled' => 'YES',
    'INFOPLIST_KEY_LSSupportsOpeningDocumentsInPlace' => 'YES',
    'SWIFT_VERSION' => '5.0', 'SWIFT_OBJC_BRIDGING_HEADER' => 'ResourceBridge.h',
    'IPHONEOS_DEPLOYMENT_TARGET' => '16.0', 'TARGETED_DEVICE_FAMILY' => '1',
    'CODE_SIGN_STYLE' => 'Automatic', 'DEVELOPMENT_TEAM' => team,
    'CURRENT_PROJECT_VERSION' => '1', 'MARKETING_VERSION' => '0.1.0'
  })
end
project.save
