import { useEffect } from 'react'
import type { ImageItem } from '../data/images'
import { destroyWall, initWall } from './wall.js'

interface NoGlWallProps {
  images: ImageItem[]
}

export function NoGlWall({ images }: NoGlWallProps) {
  useEffect(() => {
    initWall(images)
    return () => destroyWall()
  }, [images])

  return (
    <div className="wall-shell">
      <svg className="svg-defs" aria-hidden="true" focusable="false">
        <symbol id="i-photo-album" viewBox="0 0 24 24">
          <path fill="currentColor" d="M9 10.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0" />
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="m6.343 20l8.602-8.601a.25.25 0 0 1 .353 0L20 16.1M6 3h12m-9 7.5a.5.5 0 1 1-1 0a.5.5 0 0 1 1 0ZM5 20h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1Z" />
        </symbol>
        <symbol id="i-flashlight" viewBox="0 0 24 24">
          <path fill="currentColor" d="M9 10.659h1a1 1 0 0 0-.667-.943zm6 0l-.333-.943a1 1 0 0 0-.667.943zM13 12a1 1 0 1 0-2 0zm-2 2a1 1 0 1 0 2 0zM5.5 3v1h13V2h-13zM5 5h1V3.5H4V5zm4 5.659l.333-.943A5 5 0 0 1 6 5H4c0 3.05 1.95 5.641 4.667 6.601zM9 20h1v-9.341H8V20zm5 1v-1h-4v2h4zm1-10.341h-1V20h2v-9.341zM19 5h-1a5 5 0 0 1-3.333 4.716l.333.943l.333.942A7 7 0 0 0 20 5zm0-1.5h-1V5h2V3.5zM5 6v1h14V5H5zm7 6h-1v2h2v-2zm-3 8H8a2 2 0 0 0 2 2v-2zm9.5-17v1a.5.5 0 0 1-.5-.5h2A1.5 1.5 0 0 0 18.5 2zM14 21v1a2 2 0 0 0 2-2h-2zM5.5 3V2A1.5 1.5 0 0 0 4 3.5h2a.5.5 0 0 1-.5.5z" />
        </symbol>
        <symbol id="i-target" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12.89 4.049a1 1 0 1 0 .22-1.988l-.11.994zm9.049 6.841a1 1 0 0 0-1.988.22l.994-.11zm-10.69-1.796a1 1 0 1 0-.498-1.936l.249.968zm5.593 4.155a1 1 0 1 0-1.936-.498l.968.249zm-2.256-3.835h-1a1 1 0 0 0 1 1zm0-2.828l-.707-.708a1 1 0 0 0-.293.708zM18.12 3.05h1a1 1 0 0 0-1.707-.707zm0 2.828h-1a1 1 0 0 0 1 1zm2.829 0l.707.708a1 1 0 0 0-.707-1.708zm-3.536 3.536v1a1 1 0 0 0 .707-.293zm-2.414 1A1 1 0 0 0 13.586 9l.707.707zm-3.242.414a1 1 0 1 0 1.414 1.414l-.707-.707zM21 12h-1a8 8 0 0 1-8 8v2c5.523 0 10-4.477 10-10zm-9 9v-1a8 8 0 0 1-8-8H2c0 5.523 4.477 10 10 10zm-9-9h1a8 8 0 0 1 8-8V2C6.477 2 2 6.477 2 12zm9-9v1q.452 0 .89.049l.11-.994l.11-.994A10 10 0 0 0 12 2zm8.945 8l-.994.11q.048.438.049.89h2q0-.562-.061-1.11zM12 16v-1a3 3 0 0 1-3-3H7a5 5 0 0 0 5 5zm-4-4h1c0-1.396.955-2.572 2.25-2.906L11 8.126l-.25-.968A5 5 0 0 0 7 12zm7.874 1l-.969-.25A3 3 0 0 1 12 15v2a5 5 0 0 0 4.842-3.75zm-1.288-3.586h1V6.586h-2v2.828zm0-2.828l.707.707l3.535-3.536l-.707-.707l-.707-.707l-3.535 3.535zM18.12 3.05h-1v2.828h2V3.05zm0 2.828v1h2.829v-2H18.12zm2.829 0l.707-.707l-3.536 3.536l.707.707l.707.707l3.536-3.535zm-3.536 3.536v-1h-2.828v2h2.828zm-3.121.293L13.586 9l-1.828 1.828l.707.707l.707.707L15 10.414z" />
        </symbol>
        <symbol id="i-zoom-in" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M7 10.5h7M10.5 14V7m5.379 8.879l4.242 4.242M18 10.5a7.5 7.5 0 1 1-15 0a7.5 7.5 0 0 1 15 0Z" />
        </symbol>
        <symbol id="i-zoom-out" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="M7 10.5h7m1.803 5.303l4.318 4.318M18 10.5a7.5 7.5 0 1 1-15 0a7.5 7.5 0 0 1 15 0Z" />
        </symbol>
        <symbol id="i-fit" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20H4v-5m0 5l6.5-6.5M15 4h5v5m0-5l-6.5 6.5" />
        </symbol>
        <symbol id="i-close" viewBox="0 0 24 24">
          <path fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" d="m5.636 5.637l12.728 12.728m-12.728 0L18.364 5.637" />
        </symbol>
      </svg>

      <div id="stage">
        <div id="grid" className="grid" />
      </div>
      <div id="dim" />
      <div id="torch-glow" className="off" />
      <div id="torch" className="off" />
      <div id="torch-ring" className="off" />

      <div id="interactionHint" className="interaction-hint" aria-hidden="true">
        <span>拖动浏览</span>
        <span className="hint-dot" />
        <span>点击照片查看详情</span>
      </div>
      <div id="wallStatus" className="wall-status" role="status" aria-live="polite" aria-atomic="true" />

      <header id="ui">
        <div className="brand">
          <span className="brand-icon">
            <svg className="icon">
              <use href="#i-photo-album" />
            </svg>
          </span>
          <span className="text">
            <strong>fffaa photo</strong>
            <small>Infinite Wall</small>
          </span>
        </div>
        <nav className="buttons" aria-label="展示控制">
          <button id="btnTorch" type="button" className="control-btn" title="手电筒" aria-label="手电筒" aria-pressed="false">
            <svg className="icon">
              <use href="#i-flashlight" />
            </svg>
          </button>
          <button id="btnReset" type="button" className="control-btn" title="回到中心" aria-label="回到中心">
            <svg className="icon">
              <use href="#i-target" />
            </svg>
          </button>
        </nav>
      </header>

      <nav id="dock" aria-label="缩放控制">
        <button id="btnZoomOut" type="button" className="dock-btn" title="缩小" aria-label="缩小">
          <svg className="icon">
            <use href="#i-zoom-out" />
          </svg>
        </button>
        <span id="zoomValue" className="zoom-value" aria-live="polite">100%</span>
        <button id="btnZoomIn" type="button" className="dock-btn" title="放大" aria-label="放大">
          <svg className="icon">
            <use href="#i-zoom-in" />
          </svg>
        </button>
        <span className="dock-divider" />
        <button id="btnFit" type="button" className="dock-btn" title="适配屏幕" aria-label="适配屏幕">
          <svg className="icon">
            <use href="#i-fit" />
          </svg>
        </button>
      </nav>

      <div id="cover">
        <div className="cover-inner">
          <svg className="icon cover-icon">
            <use href="#i-photo-album" />
          </svg>
          <span>正在加载照片墙…</span>
        </div>
      </div>
    </div>
  )
}
