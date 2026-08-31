import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const sb = createClient(
  'https://lwwtlsxvbzmddwdcbsnj.supabase.co',
  'sb_publishable_HexDGBDO-zSLkasLjsR6rw__Vi8JMZD'
);

export function toast(msg, ms = 2600) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), ms);
}
