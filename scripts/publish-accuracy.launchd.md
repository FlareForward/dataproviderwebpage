# Publishing the FTSO accuracy feed every 10 minutes (operator opt-in)

`scripts/publish-accuracy.sh` mirrors `ftso:/home/ubuntu/ff-accuracy-feed/ftso-accuracy.json`
onto the repo's dedicated `data` branch so the public site can fetch it from
`https://raw.githubusercontent.com/FlareForward/dataproviderwebpage/data/ftso-accuracy.json`.

The script only force-pushes the `data` branch. It never touches `main` and never deploys.
It is idempotent — if the JSON hasn't changed it skips the commit + push.

**Nothing below is installed automatically. Enable it yourself when you want the 10-min cadence.**

Requirements: the `ftso` SSH host alias must be reachable non-interactively (key-based,
already configured in `~/.ssh/config`), and `git push` to `origin` must be authenticated
(the same credentials you already use for this repo).

---

## Option A — launchd (recommended on macOS)

1. Save this as `~/Library/LaunchAgents/app.flareforward.publish-accuracy.plist`, editing
   `REPO_DIR` to the absolute path of this checkout:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
     "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
   <plist version="1.0">
   <dict>
     <key>Label</key>
     <string>app.flareforward.publish-accuracy</string>
     <key>ProgramArguments</key>
     <array>
       <string>/bin/bash</string>
       <string>-lc</string>
       <string>cd "REPO_DIR" &amp;&amp; scripts/publish-accuracy.sh</string>
     </array>
     <key>StartInterval</key>
     <integer>600</integer>
     <key>RunAtLoad</key>
     <true/>
     <key>StandardOutPath</key>
     <string>/tmp/ff-publish-accuracy.log</string>
     <key>StandardErrorPath</key>
     <string>/tmp/ff-publish-accuracy.log</string>
   </dict>
   </plist>
   ```

2. Load it:

   ```bash
   launchctl load ~/Library/LaunchAgents/app.flareforward.publish-accuracy.plist
   ```

3. Watch it: `tail -f /tmp/ff-publish-accuracy.log`

To stop:

```bash
launchctl unload ~/Library/LaunchAgents/app.flareforward.publish-accuracy.plist
```

---

## Option B — cron

`crontab -e`, then add (edit the path):

```cron
*/10 * * * * cd /ABSOLUTE/PATH/TO/dataproviderwebpage && scripts/publish-accuracy.sh >> /tmp/ff-publish-accuracy.log 2>&1
```
