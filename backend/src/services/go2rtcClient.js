const GO2RTC_URL = process.env.GO2RTC_API_URL || 'http://go2rtc:1984';

export async function getStreams() {
  const res = await fetch(`${GO2RTC_URL}/api/streams`);
  return res.json();
}

export async function restart() {
  await fetch(`${GO2RTC_URL}/api/restart`, { method: 'POST' });
}
