function getKey() {
  return localStorage.getItem('admin_api_key') || '';
}

function setKey(key) {
  localStorage.setItem('admin_api_key', key);
}

async function fetchApi(path) {
  const res = await fetch(path, {
    headers: { 'x-api-key': getKey() }
  });
  if (res.status === 401) throw new Error('Unauthorized — check API key');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postApi(path, body = {}) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'x-api-key': getKey(), 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 401) throw new Error('Unauthorized — check API key');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export function fetchMetrics() {
  return fetchApi('/admin/api/metrics');
}

export function fetchQuarantine(limit = 100) {
  return fetchApi(`/admin/api/quarantine?limit=${limit}`);
}

export function releaseQuarantine(userId, unlockBracket = false) {
  return postApi(`/admin/api/quarantine/${userId}/release`, { unlock_bracket: unlockBracket });
}

export function fetchEvidence(userId, limit = 10) {
  return fetchApi(`/admin/api/evidence?userId=${userId}&limit=${limit}`);
}

export function fetchEvidenceDetail(id) {
  return fetchApi(`/admin/api/evidence/${id}`);
}

export function fetchSystem() {
  return fetchApi('/admin/api/system');
}

export function fetchLogs(lines = 50) {
  return fetchApi(`/admin/api/logs?lines=${lines}`);
}

export function fetchEncryption() {
  return fetchApi('/admin/api/encryption');
}

export function fetchHealth() {
  return fetchApi('/admin/health');
}

export function fetchTraffic() {
  return fetchApi('/admin/api/traffic');
}

export function fetchActiveUsers() {
  return fetchApi('/admin/api/active-users');
}

/**
 * Connect to SSE traffic stream.
 * Returns an EventSource. Callback fired on every traffic update.
 */
export function connectTrafficStream(onData, onError) {
  const key = getKey();
  const url = `/admin/api/traffic/stream?apiKey=${encodeURIComponent(key)}`;
  const source = new EventSource(url);

  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onData(data);
    } catch (e) {
      if (onError) onError(e);
    }
  };

  source.onerror = () => {
    if (onError) onError(new Error('SSE connection error'));
  };

  return source;
}

export { setKey };
