# Raspberry Pi 4 setup — Prayer display + Adhan clock

Step-by-step playbook for setting up a **home prayer times display** on a **Raspberry Pi 4**, plus the **adhan audio clock**.

Use this every time you set up a new house so you do not have to dig up commands again.

| Piece | What it does |
| --- | --- |
| Prayer display | Full-screen Chromium kiosk showing times / clock / night & sleep modes |
| Adhan clock | Plays adhan at each prayer via cron ([Zamy97/adhan](https://github.com/Zamy97/adhan)) |

**Official references**

- Raspberry Pi kiosk mode tutorial: [How to use a Raspberry Pi in kiosk mode](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/)
- Adhan repo: [github.com/Zamy97/adhan](https://github.com/Zamy97/adhan)
- Live display (optional online kiosk URL): [home-prayer-times-display.vercel.app](https://home-prayer-times-display.vercel.app)
- This app’s source: [github.com/Zamy97/home_prayer_times_display](https://github.com/Zamy97/home_prayer_times_display)

---

## What you need

- Raspberry Pi 4 (2GB+; **4GB recommended**)
- Official USB-C power supply
- MicroSD card (16GB+, 32GB fine)
- HDMI display / TV / monitor
- Speakers (for adhan) + 3.5mm aux or USB audio
- Keyboard + mouse for the first setup (can remove later)
- Wi‑Fi during install (display can run offline afterward if you use the local build)

**Note on username:** Newer Raspberry Pi OS images often use a custom user, not `pi`. In the commands below, if your home is `/home/yourname`, replace `/home/pi` with that path. `~` always means “current user’s home.”

---

## Part A — Prepare the Pi

### A1. Flash the OS

1. On your laptop, install [Raspberry Pi Imager](https://www.raspberrypi.com/software/).
2. Choose **Raspberry Pi OS (64-bit) with Desktop**.
3. Open **OS Customisation** (gear icon) and set:
   - Hostname (e.g. `prayer-display`)
   - Username + password
   - Wi‑Fi SSID / password
   - Locale / timezone for that house
   - Enable **SSH** if you want remote setup
4. Write the image to the SD card.

### A2. First boot

1. Insert the SD card, connect HDMI + keyboard/mouse + power.
2. Finish the first-boot wizard if it appears.
3. Update packages:

```bash
sudo apt update
sudo apt full-upgrade -y
sudo reboot
```

### A3. Auto-login + no screen blanking

```bash
sudo raspi-config
```

Then:

1. **System Options → Boot / Auto Login → Desktop Autologin**
2. **Display Options → Screen Blanking → No**
3. Finish and reboot if asked.

These match the usual kiosk prep from the [Raspberry Pi kiosk tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/).

### A4. Install base tools

```bash
sudo apt install -y git chromium mpv
```

On some images the browser package is `chromium-browser` instead of `chromium`:

```bash
sudo apt install -y chromium-browser
```

Confirm:

```bash
git --version
chromium --version || chromium-browser --version
mpv --version
```

---

## Part B — Prayer times display (kiosk)

You have **two** good options. Use **B1** for most houses (offline-capable). Use **B2** if the Pi always has internet and you want the hosted site.

### B1 — Recommended: offline local kiosk (this repo)

Runs a local build at `http://127.0.0.1:4173/` and autostarts Chromium in kiosk mode. Settings stay on the Pi under `~/.config/prayer-times-kiosk/chromium`.

#### B1.1 Clone the display app

```bash
cd ~
git clone https://github.com/Zamy97/home_prayer_times_display.git
cd ~/home_prayer_times_display
```

#### B1.2 Install Node.js (needed to build once)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

#### B1.3 Run the installer

```bash
cd ~/home_prayer_times_display
chmod +x scripts/pi-kiosk/*.sh scripts/pi-kiosk/serve.py
./scripts/pi-kiosk/install.sh
```

This will:

- Install missing packages (`python3`, `nodejs`/`npm`, Chromium) if needed
- `npm install` / `npm ci` and build the production app
- Create `~/.config/autostart/prayer-times-kiosk.desktop`
- Also append to `~/.config/labwc/autostart` (Bookworm/Trixie Wayland desktop)
- Start the kiosk **only if** a desktop session is already available

The mouse cursor stays visible so you can open Settings, leave the kiosk, or join Wi‑Fi before taking the Pi offline.

If you ran the installer over **SSH**, Chromium cannot open yet (no `$DISPLAY` / Wayland). That is expected. Enable **Desktop Autologin**, reboot, and the kiosk starts on the attached screen.

Log file:

```bash
tail -f ~/prayer-times-kiosk.log
```

To stop a failed SSH start loop (or leave kiosk for Wi‑Fi):

```bash
~/home_prayer_times_display/scripts/pi-kiosk/stop-kiosk.sh
```

Or in the app: hold top-left → Settings → **Exit to desktop**.

#### B1.4 Configure the house in Settings

1. Hold the **top-left corner** of the screen for ~1.8 seconds → Settings.
2. Set city / lat / lng, calculation method, Asr, night mode, sleep mode, etc.
3. Save (returns to the display).
4. Reboot once and confirm it comes back full-screen by itself:

```bash
sudo reboot
```

#### B1.5 Optional: take offline

After settings are saved (mouse stays visible in kiosk):

1. Confirm the display looks correct.
2. To reach Wi‑Fi: Settings → **Exit to desktop** (or run `scripts/pi-kiosk/stop-kiosk.sh`).  
   Do **not** rely on Ctrl+W / Alt+F4 — the kiosk reopens those automatically.
3. Use the Pi desktop Wi‑Fi icon, then run `start-kiosk.sh` or reboot.
4. When ready for offline: turn Wi‑Fi off and reboot.
5. Prayer times, clock, night/sleep modes, and saved settings still work. Weather may show the last cached value or `--`.
6. Hijri date uses the same Central Hilal Committee calendar as online. The local kiosk server keeps calling `/api/hijri` (cache: `~/.config/prayer-times-kiosk/hijri-calendar.json`); the app also keeps a browser copy. Offline keeps the last good CHC day/name; when the network returns it refreshes again.

#### B1.6 Uninstall / stop autostart

```bash
cd ~/home_prayer_times_display
./scripts/pi-kiosk/uninstall.sh
```

This removes desktop/labwc autostart and stops `serve.py` + Chromium. The local server only runs while the B1 kiosk is active (on desktop login); it is not a separate always-on system service.

#### B1.7 Switch to online (B2) later

1. Run `./scripts/pi-kiosk/uninstall.sh` so the local kiosk no longer autostarts.
2. Follow **B2** below (Chromium opens the Vercel URL).
3. Keep Wi‑Fi on. Reconfigure Settings once — B2 uses a different Chromium profile, so house settings do not carry over automatically.

---

### B2 — Online kiosk (hosted Vercel URL)

Use when the Pi always has internet. Closest to the official [kiosk mode tutorial](https://www.raspberrypi.com/tutorials/how-to-use-a-raspberry-pi-in-kiosk-mode/) pattern: Chromium opens a URL full-screen on desktop login.

**URL:** `https://home-prayer-times-display.vercel.app`

#### B2.1 Create a start script

```bash
mkdir -p ~/bin
nano ~/bin/prayer-kiosk.sh
```

Paste (adjust the Chromium binary name if needed):

```bash
#!/usr/bin/env bash
set -euo pipefail

URL="https://home-prayer-times-display.vercel.app/"
PROFILE_DIR="${HOME}/.config/prayer-times-kiosk-online/chromium"
mkdir -p "$PROFILE_DIR"

# Prefer whichever Chromium package exists
if command -v chromium >/dev/null 2>&1; then
  CHROMIUM=chromium
else
  CHROMIUM=chromium-browser
fi

# Restart browser if it crashes
while true; do
  "$CHROMIUM" \
    --kiosk "$URL" \
    --app="$URL" \
    --user-data-dir="$PROFILE_DIR" \
    --no-first-run \
    --no-default-browser-check \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-translate \
    --ozone-platform-hint=auto \
    --autoplay-policy=no-user-gesture-required || true
  sleep 3
done
```

```bash
chmod +x ~/bin/prayer-kiosk.sh
```

#### B2.2 Autostart on desktop login (works on current Pi OS)

```bash
mkdir -p ~/.config/autostart
nano ~/.config/autostart/prayer-times-kiosk.desktop
```

Paste:

```ini
[Desktop Entry]
Type=Application
Name=Prayer Times Kiosk
Comment=Full-screen prayer times display
Exec=/home/REPLACE_USER/bin/prayer-kiosk.sh
Terminal=false
X-GNOME-Autostart-enabled=true
```

Replace `REPLACE_USER` with your username (`echo $USER`).

#### B2.3 Optional: labwc autostart (Bookworm / Trixie default compositor)

If you prefer the compositor autostart file (see Raspberry Pi forum notes on **labwc**):

```bash
mkdir -p ~/.config/labwc
nano ~/.config/labwc/autostart
```

Add a line like:

```bash
/home/REPLACE_USER/bin/prayer-kiosk.sh &
```

Do **not** enable both this and the `.desktop` autostart unless you want two browsers.

#### B2.4 Configure Settings once

Open the kiosk, hold top-left → Settings → set that house’s location → Save. Settings are stored in the Chromium profile folder above.

---

## Part C — Adhan audio clock

Based on [Zamy97/adhan](https://github.com/Zamy97/adhan) (Raspberry Pi Adhan Clock). It calculates daily prayer times and schedules five cron jobs that play MP3 adhans, plus a 1am job that refreshes timers for the next day.

### C1. Speakers

1. Plug speakers into the Pi (3.5mm or USB).
2. In the desktop: right-click the speaker icon → choose the correct output.
3. Test volume:

```bash
mpv --volume=80 /usr/share/sounds/alsa/Front_Center.wav
```

(If that sample file is missing, any short MP3/WAV is fine.)

### C2. Install / clone adhan

```bash
cd ~
sudo apt-get install -y git mpv
git clone https://github.com/Zamy97/adhan.git
cd ~/adhan
```

You should see files like `updateAzaanTimers.py`, `playAzaan.sh`, and the Azan MP3s.

### C3. Make scripts executable

```bash
cd ~/adhan
chmod +x updateAzaanTimers.py playAzaan.sh
```

If Python cannot run the updater directly:

```bash
python3 updateAzaanTimers.py -h
```

### C4. First run — set house location + method

Use the **same lat/lng and method** you use in the prayer display Settings for that house.

```bash
cd ~/adhan
./updateAzaanTimers.py --lat YOUR_LAT --lng YOUR_LNG --method ISNA
```

Examples of methods (see [praytimes.org manual](http://praytimes.org/manual#Set_Calculation_Method)): `ISNA`, `MWL`, `Egypt`, `Makkah`, `Karachi`, …

Example (Detroit-area placeholder — replace with the house):

```bash
./updateAzaanTimers.py --lat 42.3314 --lng -83.0458 --method ISNA
```

Optional volume flags (millibels — see `-h` for details):

```bash
./updateAzaanTimers.py --lat YOUR_LAT --lng YOUR_LNG --method ISNA \
  --fajr-azaan-volume 0 --azaan-volume 0
```

**Success looks like:** printed Fajr/Dhuhr/Asr/Maghrib/Isha times, then five `cron` lines ending in `# rpiAdhanClockJob`, plus a `0 1 * * *` nightly refresh and a monthly log truncate.

Settings are saved in `~/adhan/.settings`. Later you can refresh without args:

```bash
cd ~/adhan
./updateAzaanTimers.py
```

### C5. Confirm cron jobs

```bash
crontab -l
```

You should see five adhan play lines for today and:

```text
0 1 * * * /home/pi/adhan/updateAzaanTimers.py >> /home/pi/adhan/adhan.log 2>&1 # rpiAdhanClockJob
```

(Path may show your username instead of `pi`.)

### C6. Test play manually

```bash
cd ~/adhan
./playAzaan.sh ./Azan.mp3 0
```

Or whichever MP3 files exist in the repo (`Azan1.mp3`, `Fozor_Azan.mp3`, etc.).

### C7. Logs

```bash
tail -f ~/adhan/adhan.log
```

Monthly truncate is scheduled by the updater so the log does not grow forever.

### C8. Optional before/after hooks

If you need to pause something else while adhan plays (e.g. Quran speaker), add scripts under:

- `~/adhan/before-hooks.d/`
- `~/adhan/after-hooks.d/`

Make them executable (`chmod u+x …`). See the [adhan README](https://github.com/Zamy97/adhan) for examples.

---

## Part D — Per-house checklist (print / copy)

Copy this for each install:

```text
House name: ____________________
Date installed: ________________

Pi username: ___________________
Hostname: ______________________

Display mode:  [ ] B1 offline local   [ ] B2 Vercel URL
Display URL / path: ________________________________

Lat: ____________   Lng: ____________
Timezone: __________________________
Calc method: ________  Asr: ________

Adhan installed: [ ] yes
Adhan method matches display: [ ] yes
Speakers tested: [ ] yes
Auto-login: [ ] yes
Screen blanking off: [ ] yes
Reboot test OK: [ ] yes
Night / sleep mode configured: [ ] yes
```

**Keep display Settings and adhan `--lat/--lng/--method` in sync** for that house.

---

## Useful commands (cheat sheet)

```bash
# Who am I / home path
whoami
echo $HOME

# See desktop autostart entry
cat ~/.config/autostart/prayer-times-kiosk.desktop

# Restart offline kiosk by hand
~/home_prayer_times_display/scripts/pi-kiosk/start-kiosk.sh

# Rebuild display after a git pull
cd ~/home_prayer_times_display
git pull
npm run kiosk:build

# Adhan schedule
crontab -l
cd ~/adhan && ./updateAzaanTimers.py
tail -n 50 ~/adhan/adhan.log

# Audio devices
wpctl status
# or older:
amixer scontrols
```

---

## Troubleshooting

| Problem | What to try |
| --- | --- |
| `Missing X server or $DISPLAY` in the log | Installer was run over SSH with no desktop. Enable **Desktop Autologin**, `sudo reboot`. Or pull latest scripts and re-run `./scripts/pi-kiosk/install.sh`. Stop the loop: `scripts/pi-kiosk/stop-kiosk.sh` |
| Black screen / no kiosk after reboot | Confirm **Desktop Autologin**; check `~/.config/autostart/…desktop` and `~/.config/labwc/autostart`; `tail ~/prayer-times-kiosk.log` |
| Browser opens then closes | Run `start-kiosk.sh` **from the Pi desktop** (not plain SSH) and read errors; ensure Chromium is installed |
| Ctrl+W / Alt+F4 reopens the browser | Expected — the kiosk auto-restarts. Use Settings → **Exit to desktop** or `scripts/pi-kiosk/stop-kiosk.sh` |
| Need Wi‑Fi / desktop while kiosk is open | Settings → **Exit to desktop**, then use the Wi‑Fi icon; reboot or run `start-kiosk.sh` to return |
| Screen goes dark | `raspi-config` → Screen Blanking → No |
| Wrong prayer times | Match lat/lng/method/Asr in display Settings; for adhan re-run `updateAzaanTimers.py` with the same values |
| No adhan sound | Check speaker output device; `mpv` a test file; run `./playAzaan.sh` manually; confirm `crontab -l` |
| Cron times wrong after move | Re-run `./updateAzaanTimers.py --lat … --lng … --method …` |
| Online kiosk blank | Pi needs internet; open the Vercel URL in a normal browser first |
| Username / paths wrong | Replace `/home/pi` with `echo $HOME` |

---

## Suggested order for a new house

1. Part A — flash, update, auto-login, blanking off, packages  
2. Part B1 (or B2) — prayer display kiosk + Settings for that house  
3. Part C — adhan with the **same** lat/lng/method  
4. Part D — fill the checklist, reboot twice, test one manual adhan play  

That is the full repeatable setup for Pi 4 display mode + adhan.
