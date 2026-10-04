# Adds FCFB's files and settings to the Xcode project that Capacitor creates.
require 'xcodeproj'

bundle_id = ENV['BUNDLE_ID'] || 'com.Amra.fcfb'
version   = ENV['APP_VERSION'] || '1.0'

project = Xcodeproj::Project.open('ios/App/App.xcodeproj')
target = project.targets.find { |t| t.name == 'App' } or abort('Could not find the App target')
group = project.main_group.groups.find { |g| g.path == 'App' || g.name == 'App' } || project.main_group

def ensure_file(group, target, name, add_to_bundle)
  ref = group.files.find { |f| f.path == name } || group.new_reference(name)
  if add_to_bundle && !target.resources_build_phase.files_references.include?(ref)
    target.resources_build_phase.add_file_reference(ref)
  end
  ref
end

ensure_file(group, target, 'GoogleService-Info.plist', true)
ensure_file(group, target, 'PrivacyInfo.xcprivacy', true)
ensure_file(group, target, 'App.entitlements', false)

target.build_configurations.each do |config|
  s = config.build_settings
  s['PRODUCT_BUNDLE_IDENTIFIER'] = bundle_id
  s['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  s['TARGETED_DEVICE_FAMILY'] = '1'          # iPhone only (no iPad screenshots needed)
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  s['MARKETING_VERSION'] = version
end

project.save
puts "Xcode project updated for #{bundle_id} (version #{version})"
