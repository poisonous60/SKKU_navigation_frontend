// ===== Video Settings Panel — bulk yaw assignment per video =====

import { getAllVideos, VideoEntry } from './videoCatalog';
import * as VideoSettings from './videoSettings';
import { VideoYawEntry } from './videoSettings';
import { openVideoPreview } from './videoPreview';

let overlayEl: HTMLElement | null = null;

export function openVideoSettingsPanel(): void {
  if (overlayEl) return;

  const backdrop = document.createElement('div');
  backdrop.className = 'ge-video-preview-backdrop';

  const panel = document.createElement('div');
  panel.className = 'ge-video-settings-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'ge-video-preview-header';
  header.innerHTML = '<span>Video Settings</span>';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'ge-header-btn';
  closeBtn.innerHTML = '<span class="material-icons" style="font-size:18px">close</span>';
  closeBtn.addEventListener('click', close);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'ge-video-settings-body';

  const videos = getAllVideos();
  const groups: Record<string, VideoEntry[]> = { corridor: [], stair: [], elevator: [] };
  for (const v of videos) groups[v.type].push(v);

  const typeLabels: Record<string, string> = { corridor: '복도', stair: '계단', elevator: '엘리베이터' };

  for (const type of ['corridor', 'stair', 'elevator'] as const) {
    if (groups[type].length === 0) continue;

    const groupHeader = document.createElement('div');
    groupHeader.className = 'ge-vs-group-header';
    if (type === 'corridor') {
      groupHeader.textContent = typeLabels[type];
    } else {
      // Show column headers for entry/exit
      groupHeader.innerHTML = `<span>${typeLabels[type]}</span><span class="ge-vs-col-headers"><span>entry</span><span>exit</span></span>`;
    }
    body.appendChild(groupHeader);

    for (const v of groups[type]) {
      if (type === 'corridor') {
        body.appendChild(buildCorridorRow(v));
      } else {
        body.appendChild(buildStairElevRow(v));
      }
    }
  }

  panel.appendChild(header);
  panel.appendChild(body);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  backdrop.addEventListener('click', close);
  overlayEl = panel;
  (panel as any)._backdrop = backdrop;
}

// ===== Corridor: single yaw =====

function buildCorridorRow(v: VideoEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ge-vs-row';

  const label = document.createElement('span');
  label.className = 'ge-vs-label';
  label.textContent = v.label;

  const entry = VideoSettings.getEntry(v.filename);
  const yawSpan = document.createElement('span');
  yawSpan.className = 'ge-vs-yaw';
  yawSpan.textContent = fmtYaw(entry?.yaw);

  const btn = createPreviewBtn(v.filename, 'yaw', yawSpan);

  row.appendChild(label);
  row.appendChild(yawSpan);
  row.appendChild(btn);
  return row;
}

// ===== Stair/Elevator: entry + exit yaw in one row =====

function buildStairElevRow(v: VideoEntry): HTMLElement {
  const row = document.createElement('div');
  row.className = 'ge-vs-row';

  const label = document.createElement('span');
  label.className = 'ge-vs-label';
  label.textContent = v.label;

  const entry = VideoSettings.getEntry(v.filename);

  // Entry yaw
  const entryYawSpan = document.createElement('span');
  entryYawSpan.className = 'ge-vs-yaw';
  entryYawSpan.textContent = fmtYaw(entry?.entryYaw);
  const entryBtn = createPreviewBtn(v.filename, 'entryYaw', entryYawSpan);
  entryBtn.title = '들어갈 때';

  // Exit yaw
  const exitYawSpan = document.createElement('span');
  exitYawSpan.className = 'ge-vs-yaw';
  exitYawSpan.textContent = fmtYaw(entry?.exitYaw);
  const exitBtn = createPreviewBtn(v.filename, 'exitYaw', exitYawSpan);
  exitBtn.title = '나올 때';

  row.appendChild(label);
  row.appendChild(entryYawSpan);
  row.appendChild(entryBtn);
  row.appendChild(exitYawSpan);
  row.appendChild(exitBtn);
  return row;
}

// ===== Helpers =====

function createPreviewBtn(
  filename: string,
  field: keyof VideoYawEntry,
  yawSpan: HTMLSpanElement,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = 'ge-small-btn';
  btn.innerHTML = '<span class="material-icons" style="font-size:16px">360</span>';
  btn.title = 'Set Direction';

  btn.addEventListener('click', () => {
    const videoUrl = `/videos/${filename}`;
    const current = VideoSettings.getEntry(filename);
    const currentYaw = current?.[field];
    openVideoPreview({
      videoUrl,
      initialYaw: currentYaw,
      onConfirm: (newYaw: number) => {
        VideoSettings.setField(filename, field, newYaw);
        yawSpan.textContent = fmtYaw(newYaw);
      },
      onCancel: () => {},
    });
  });

  return btn;
}

function fmtYaw(yaw: number | undefined): string {
  return yaw !== undefined ? `${yaw.toFixed(1)}°` : '-';
}

function close(): void {
  if (!overlayEl) return;
  const backdrop = (overlayEl as any)._backdrop as HTMLElement;
  backdrop?.remove();
  overlayEl.remove();
  overlayEl = null;
}
