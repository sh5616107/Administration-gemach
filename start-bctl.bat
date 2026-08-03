@echo off
chcp 65001 >nul
setlocal EnableExtensions

rem ================================================================
rem  start-bctl.bat — מפעיל את שרת ה-relay של BrowserCtl
rem  רק אם הוא לא רץ כבר, כך שהתוסף יישאר מחובר תמיד.
rem
rem  שימוש:
rem    start-bctl.bat             ברירת מחדל — פורט 9798
rem    start-bctl.bat 9799       פורט אחר
rem ================================================================

set "PORT=9798"
if not "%~1"=="" set "PORT=%~1"

rem --- עבודה מהתיקייה של הסקריפט עצמו ---
pushd "%~dp0"

rem --- בדיקה: Node.js מותקן? ---
where node >nul 2>&1
if errorlevel 1 (
    echo [BrowserCtl] שגיאה: Node.js לא נמצא. התקן מ- https://nodejs.org
    popd
    exit /b 1
)

rem --- בדיקה: השרת כבר רץ על הפורט הזה? ---
curl -s --max-time 2 "http://127.0.0.1:%PORT%/health" >nul 2>&1
if not errorlevel 1 (
    echo [BrowserCtl] השרת כבר רץ על פורט %PORT%. אין צורך בכלום.
    popd
    exit /b 0
)

echo [BrowserCtl] השרת לא רץ על פורט %PORT%. מתחיל אותו בחלון ממוזער...
start "BrowserCtl relay" /min cmd /c "node tools\control-server.js --port %PORT%"

rem --- המתנה קצרה עד שהשרת עולה (עובד גם בלי קונסולה) ---
ping -n 3 127.0.0.1 >nul

curl -s --max-time 2 "http://127.0.0.1:%PORT%/health" >nul 2>&1
if not errorlevel 1 (
    echo [BrowserCtl] השרת הופעל בהצלחה על פורט %PORT%.
) else (
    echo [BrowserCtl] לא הצלחנו לוודא שהשרת עלה. בדוק ידנית: node tools\control-server.js
)

popd
endlocal
exit /b 0
