# Troubleshooting

## No Chromecast Devices Found

**Check Avahi is running:**
```bash
sudo systemctl status avahi-daemon
avahi-browse _googlecast._tcp --terminate
```

**Ensure mDNS reflector is enabled:**
```bash
grep enable-reflector /etc/avahi/avahi-daemon.conf
# Should show: enable-reflector=yes
```

**VLAN issues:** Chromecasts must be on the same LAN subnet as the Conduit Caster host. If they are on a different VLAN, mDNS will not cross the boundary. Options:
- Move devices to the same VLAN
- Configure an mDNS repeater/proxy on your router
- Add Chromecasts manually by IP in the Devices page

**systemd-resolved conflict:**
```bash
# Ensure systemd-resolved mDNS is disabled
grep MulticastDNS /etc/systemd/resolved.conf
# Should show: MulticastDNS=no
```

## RTMP Stream Not Connecting

**Check MediaMTX is running:**
```bash
docker compose logs mediamtx
curl http://localhost:8888/v3/paths/list
```

**Firewall:** Ensure port 1935 is open:
```bash
sudo ufw status
sudo ufw allow 1935/tcp
```

**ATEM configuration:** Verify the RTMP URL matches `rtmp://<ip>:1935/<path>` exactly. The path must match what's configured in Stream Config (default: `live`).

## Stream Preview Not Working

**WebRTC (LAN):**
- Check go2rtc is running: `docker compose logs go2rtc`
- Ensure port 8555 is open (TCP+UDP)
- Check ICE candidates: `curl http://localhost:1984/api/webrtc?src=live` (from inside Docker network)

**HLS (Tailscale):**
- Check MediaMTX HLS is available: `curl http://localhost:8888/live/index.m3u8`
- Ensure stream is actively publishing

## Chromecast Not Playing

**Check HLS is accessible from LAN:**
```bash
curl http://<host-ip>:8888/live/index.m3u8
```
Chromecasts pull HLS directly from port 8888. This port must be accessible from the Chromecast on the LAN.

**Check cast status:**
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/cast/status
```

## Docker Issues

**View logs:**
```bash
docker compose logs -f
docker compose logs -f backend
docker compose logs -f mediamtx
```

**Restart services:**
```bash
docker compose restart
```

**Full rebuild:**
```bash
docker compose down
docker compose pull
docker compose up -d
```
