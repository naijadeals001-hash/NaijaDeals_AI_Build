@echo off
cd /d C:\Users\User\naijadeals-live
"C:\Program Files\nodejs\npm.cmd" run dev -- --port 3010 >> C:\Users\User\Documents\naijadeals.com\qa-artifacts\preview-3010.log 2>&1
