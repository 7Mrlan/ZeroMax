source 'https://rubygems.org'

# You may use http://rbenv.org/ or https://rvm.io/ to install and use this version
ruby ">= 2.6.10"

# Exclude problematic versions of cocoapods and activesupport that cause build failures.
# The old `xcodeproj < 1.26` / `concurrent-ruby < 1.3.4` pins were workarounds for
# CocoaPods 1.15 issues; they held the lockfile at 1.15.2 while Pods were actually
# installed with 1.16.2 (i.e. someone ran `pod install` outside `bundle exec`).
gem 'cocoapods', '>= 1.16.2', '!= 1.15.0', '!= 1.15.1'
gem 'activesupport', '>= 6.1.7.5', '!= 7.1.0'
# Ruby 3.4 unbundled nkf; CocoaPods still needs it (added by the RN 0.86 template).
gem 'nkf'
