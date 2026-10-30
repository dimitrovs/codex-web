'use client';

import { useEffect, useRef } from 'react';
import type { ScreenShareFrameCommand, ScreenShareFrameMessage } from './screen-share-frame-protocol';

function post(message: ScreenShareFrameMessage): void {
  window.parent.postMessage(message, window.location.origin);
}

export function ScreenShareFrame() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rfbInstance: any = null;
    let disconnected = false;

    const connect = async (wsUrl: string) => {
      if (rfbInstance) {
        try {
          rfbInstance.disconnect();
        } catch {
          // ignore
        }
        rfbInstance = null;
      }

      post({ type: 'screen-frame/status', state: 'connecting' });

      try {
        const { default: RFB } = await import('@novnc/novnc');
        if (disconnected || !containerRef.current) return;

        const rfb = new (RFB as any)(container, wsUrl, {
          shared: true,
          credentials: { password: '' },
        });

        rfb.scaleViewport = true;
        rfb.resizeSession = false;
        rfb.viewOnly = false;
        rfb.clipViewport = false;

        rfb.addEventListener('connect', () => {
          post({
            type: 'screen-frame/status',
            state: 'connected',
            width: rfb._fbWidth,
            height: rfb._fbHeight,
          });
        });

        rfb.addEventListener('disconnect', (e: any) => {
          post({
            type: 'screen-frame/status',
            state: 'disconnected',
            reason: e.detail?.reason || (e.detail?.clean ? 'clean' : 'connection closed'),
          });
        });

        rfb.addEventListener('securityfailure', (e: any) => {
          post({
            type: 'screen-frame/error',
            message: e.detail?.reason || 'Security failure',
          });
        });

        rfb.addEventListener('capabilities', () => {
          post({
            type: 'screen-frame/status',
            state: 'connected',
            width: rfb._fbWidth,
            height: rfb._fbHeight,
          });
        });

        rfbInstance = rfb;
      } catch (err) {
        post({
          type: 'screen-frame/error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    };

    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || event.source !== window.parent) return;
      const command = event.data as ScreenShareFrameCommand;
      if (!command || typeof command !== 'object') return;

      if (command.type === 'screen-frame/connect' || command.type === 'screen-frame/takeover') {
        void connect(command.wsUrl);
      } else if (command.type === 'screen-frame/disconnect') {
        try {
          rfbInstance?.disconnect();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('message', onMessage);
    post({ type: 'screen-frame/ready' });

    return () => {
      disconnected = true;
      window.removeEventListener('message', onMessage);
      if (rfbInstance) {
        try {
          rfbInstance.disconnect();
        } catch {
          // ignore
        }
        rfbInstance = null;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-900"
      style={{ userSelect: 'none' }}
    />
  );
}
