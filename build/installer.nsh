!macro customInit
  nsExec::ExecToLog 'taskkill /F /T /IM "Centro Automotivo 0058.exe"'
  Sleep 800
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /T /IM "Centro Automotivo 0058.exe"'
  Sleep 500
!macroend
