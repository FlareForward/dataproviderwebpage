# Refreshing the FTSO accuracy feed (operator opt-in)

`scripts/publish-accuracy.sh` pulls `ftso:/home/ubuntu/ff-accuracy-feed/ftso-accuracy.json`
off the box, validates it, and — only if it changed — writes it to
`public/ftso-accuracy.json` and commits it on the **current branch**.

The site fetches it **same-origin** at `/ftso-accuracy.json` (see `src/hooks/useAccuracy.ts`).
Same-origin is used because this repo is **private** — `raw.githubusercontent.com` 404s for
private repos, so a `data`-branch + raw-URL approach can't be fetched by the browser without a
token. Serving from the site's own origin needs no token.

The script **does not push and does not deploy.** It is idempotent — if the JSON is
byte-identical to what's already on disk it does nothing.

> **Freshness tradeoff:** because the file is a static asset baked into the deployed bundle,
> the **live** file only changes when the site is **redeployed**. Running this every 10 minutes
> keeps the working copy + git history fresh, but visitors see the new numbers only after a
> deploy. Two ways to handle that:
>
> - **(a) Deploy-cadence** — run this paired with your deploy step, at whatever cadence you
>   redeploy. Simple; freshness == deploy frequency.
> - **(b) Continuous (recommended follow-up)** — serve `/ftso-accuracy.json` from a Cloudflare
>   Worker backed by KV/R2 and have the box `PUT` the JSON there every ~10 min. Then the live
>   file updates without any redeploy. This is a separate task, not wired up here.

**Nothing below is installed automatically. Enable it yourself if you want a timer.**

Requirements: the `ftso` SSH host alias must be reachable non-interactively (key-based, already
in `~/.ssh/config`). No git push credentials are needed unless you also add a push/deploy step.

Env knobs (see the script header): `FTSO_SSH_HOST`, `FTSO_JSON_PATH`, `ASSET_PATH`, `DO_COMMIT`
(set `DO_COMMIT=0` to only update the file without committing).

---

## Option A — launchd (recommended on macOS)

1. Save as `~/Library/LaunchAgents/app.flareforward.publish-accuracy.plist`, editing `REPO_DIR`:

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

2. Load: `launchctl load ~/Library/LaunchAgents/app.flareforward.publish-accuracy.plist`
3. Watch: `tail -f /tmp/ff-publish-accuracy.log`

Stop: `launchctl unload ~/Library/LaunchAgents/app.flareforward.publish-accuracy.plist`

---

## Option B — cron

`crontab -e`, then (edit the path):

```cron
*/10 * * * * cd /ABSOLUTE/PATH/TO/dataproviderwebpage && scripts/publish-accuracy.sh >> /tmp/ff-publish-accuracy.log 2>&1
```
