@echo off
cd /d %~dp0
title AI Data Extractor Server
echo ==========================================================
echo AI Data Extractor 로컬 서버를 시작합니다...
echo 첫 실행 시 필요 모듈을 로드하는데 시간이 걸릴 수 있습니다.
echo 창을 끄지 마시고, 브라우저에서 아래 주소로 접속해 주세요:
echo http://127.0.0.1:5000/
echo ==========================================================
python app.py
pause
