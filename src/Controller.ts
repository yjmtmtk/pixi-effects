import type { Movie } from './core/Movie';

export interface ControllerOptions {
  container?: HTMLElement;
  showVolumeControl?: boolean;
  showTimeDisplay?: boolean;
  showFrameDisplay?: boolean;
  showExportButton?: boolean;
  enableKeyboardShortcuts?: boolean;
  className?: string;
}

export class Controller {
  movie: Movie;
  options: Required<ControllerOptions>;
  private isReady = false;
  private isDragging = false;
  private wasPlayingBeforeDrag = false;
  private showFrameInfo = false;
  private isExporting = false;
  private elements: Record<string, HTMLElement | null> = {};
  private _mouseUpHandler: ((e: MouseEvent) => void) | null = null;
  private _keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(movie: Movie, options: ControllerOptions = {}) {
    this.movie = movie;
    this.options = {
      container: document.body,
      showVolumeControl: true,
      showTimeDisplay: true,
      showFrameDisplay: true,
      showExportButton: true,
      enableKeyboardShortcuts: true,
      className: 'movie-controller',
      ...options,
    };

    this.init();
  }

  init(): void {
    this.createHTML();
    this.bindEvents();
    this.updateUIState();
  }

  createHTML(): void {
    const container = this.options.container;

    // メインコントローラーHTML
    const controllerHTML = `
            <div id="controls" class="${this.options.className}">
                <button id="prevBtn" class="btn frame" disabled>⏮</button>
                <button id="playBtn" class="btn primary" disabled>▶</button>
                <button id="nextBtn" class="btn frame" disabled>⏭</button>

                <input type="range" id="seek" value="0" min="0" step="1" disabled>

                ${this.options.showVolumeControl ? `
                <div class="volume-control">
                    <button id="muteBtn" class="mute-btn">🔊</button>
                    <input type="range" id="volumeSlider" value="100" min="0" max="100" step="1">
                    <span id="volumeDisplay">100%</span>
                </div>
                ` : ''}

                ${this.options.showTimeDisplay || this.options.showFrameDisplay ? `
                <div class="frame-info">
                    ${this.options.showFrameDisplay ? `<div class="info hidden" id="frame-display">Frame: 0 / 0</div>` : ''}
                    ${this.options.showTimeDisplay ? `<div class="info" id="time-display">Time: 00:00 / 00:00</div>` : ''}
                </div>
                ` : ''}

                ${this.options.showExportButton ? `<button id="exportBtn" class="btn" disabled>Export</button>` : ''}
            </div>

            <!-- Export Progress Overlay -->
            <div id="exportProgress" style="display: none;">
                <div class="progress-container">
                    <div class="progress-title">動画をエクスポート中...</div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" id="progressBar"></div>
                    </div>
                    <div class="progress-text" id="progressText">0% (0 / 0 フレーム)</div>
                </div>
            </div>
        `;

    // スタイルを追加
    this.addStyles();

    // HTMLを挿入
    container.insertAdjacentHTML('beforeend', controllerHTML);

    // 要素の参照を取得
    this.elements = {
      controls: document.getElementById('controls'),
      seek: document.getElementById('seek') as HTMLInputElement | null,
      playBtn: document.getElementById('playBtn') as HTMLButtonElement | null,
      prevBtn: document.getElementById('prevBtn') as HTMLButtonElement | null,
      nextBtn: document.getElementById('nextBtn') as HTMLButtonElement | null,
      exportBtn: this.options.showExportButton ? document.getElementById('exportBtn') as HTMLButtonElement | null : null,
      frameDisplay: this.options.showFrameDisplay ? document.getElementById('frame-display') : null,
      timeDisplay: this.options.showTimeDisplay ? document.getElementById('time-display') : null,
      volumeSlider: this.options.showVolumeControl ? document.getElementById('volumeSlider') as HTMLInputElement | null : null,
      volumeDisplay: this.options.showVolumeControl ? document.getElementById('volumeDisplay') : null,
      muteBtn: this.options.showVolumeControl ? document.getElementById('muteBtn') as HTMLButtonElement | null : null,
      exportProgress: document.getElementById('exportProgress'),
      progressBar: document.getElementById('progressBar'),
      progressText: document.getElementById('progressText'),
    };
  }

  addStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
            .${this.options.className} {
                display: flex;
                align-items: center;
                gap: 15px;
                margin-top: 15px;
                padding: 15px;
                background: #1a1a1a;
                border-radius: 8px;
            }

            .btn {
                background: #333;
                border: none;
                border-radius: 6px;
                padding: 8px 12px;
                color: #fff;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            }

            .btn:hover {
                background: #444;
            }

            .btn.primary {
                background: #007AFF;
                min-width: 60px;
                height: 40px;
                text-align: center;
                line-height: 1;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .btn.primary:hover {
                background: #0056CC;
            }

            .btn.frame {
                background: #666;
                padding: 6px 8px;
                font-size: 12px;
                border-radius: 4px;
            }

            .btn.frame:hover {
                background: #777;
            }

            .btn:disabled {
                background: #222;
                color: #666;
                cursor: not-allowed;
            }

            .btn:disabled:hover {
                background: #222;
                transform: none;
            }

            #seek:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }

            #seek {
                flex: 1;
                height: 6px;
                border-radius: 3px;
                background: #444;
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                cursor: pointer;
            }

            #seek::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #007AFF;
                cursor: pointer;
            }

            #seek::-moz-range-thumb {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                background: #007AFF;
                cursor: pointer;
                border: none;
            }

            .info {
                font-size: 12px;
                color: #888;
                white-space: nowrap;
                font-family: 'Monaco', 'Menlo', monospace;
                cursor: pointer;
                transition: color 0.2s;
            }

            .info:hover {
                color: #007AFF;
            }

            .info.hidden {
                display: none;
            }

            .frame-info {
                display: flex;
                flex-direction: column;
                gap: 2px;
                min-width: 120px;
            }

            .volume-control {
                display: flex;
                align-items: center;
                gap: 8px;
                color: #888;
                font-size: 12px;
            }

            #volumeSlider {
                width: 80px;
                height: 4px;
                border-radius: 2px;
                background: #444;
                outline: none;
                -webkit-appearance: none;
                appearance: none;
                cursor: pointer;
            }

            #volumeSlider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #007AFF;
                cursor: pointer;
            }

            #volumeSlider::-moz-range-thumb {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #007AFF;
                cursor: pointer;
                border: none;
            }

            .mute-btn {
                background: none;
                border: none;
                color: #888;
                font-size: 16px;
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                justify-content: center;
                width: 28px;
                height: 28px;
            }

            .mute-btn:hover {
                background: #333;
                color: #fff;
            }

            .mute-btn.muted {
                color: #ff4444;
            }

            .mute-btn.muted:hover {
                color: #ff6666;
            }

            #exportProgress {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: none;
                justify-content: center;
                align-items: center;
                z-index: 1000;
            }

            .progress-container {
                background: #1a1a1a;
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                min-width: 300px;
            }

            .progress-title {
                color: #fff;
                font-size: 18px;
                margin-bottom: 20px;
            }

            .progress-bar-container {
                width: 100%;
                height: 8px;
                background: #333;
                border-radius: 4px;
                margin-bottom: 15px;
                overflow: hidden;
            }

            .progress-bar {
                height: 100%;
                background: linear-gradient(90deg, #007AFF, #0056CC);
                width: 0%;
                transition: width 0.3s ease;
                border-radius: 4px;
            }

            .progress-text {
                color: #888;
                font-size: 14px;
                font-family: 'Monaco', 'Menlo', monospace;
            }
        `;
    document.head.appendChild(style);
  }

  bindEvents(): void {
    this.bindMovieEvents();
    this.bindUIEvents();
    if (this.options.enableKeyboardShortcuts) {
      this.bindKeyboardEvents();
    }
  }

  bindMovieEvents(): void {
    // プログレスイベント
    this.movie.on('progress', ({ progress, frame, totalFrames }) => {
      console.log(`Rendering... ${progress}% (${frame}/${totalFrames})`);
      if (this.isExporting) {
        (this.elements.progressBar as HTMLElement).style.width = `${progress}%`;
        (this.elements.progressText as HTMLElement).textContent = `${progress}% (${frame} / ${totalFrames} フレーム)`;
      }
    });

    // フレーム更新イベント
    this.movie.on('frame', ({ frame, totalFrames }) => {
      if (!this.isDragging) {
        (this.elements.seek as HTMLInputElement).value = String(frame);
      }
      if (this.elements.frameDisplay) {
        this.elements.frameDisplay.textContent = `Frame: ${frame} / ${totalFrames}`;
      }

      if (this.elements.timeDisplay) {
        const currentSeconds = frame / this.movie.frameRate;
        const totalSeconds = totalFrames / this.movie.frameRate;
        this.elements.timeDisplay.textContent = `Time: ${this.formatTime(currentSeconds)} / ${this.formatTime(totalSeconds)}`;
      }
    });

    // 準備完了イベント
    this.movie.on('ready', () => {
      this.isReady = true;

      (this.elements.seek as HTMLInputElement).max = String(this.movie.totalFrames);
      const totalSeconds = this.movie.totalFrames / this.movie.frameRate;

      if (this.elements.frameDisplay) {
        this.elements.frameDisplay.textContent = `Frame: 0 / ${this.movie.totalFrames}`;
      }
      if (this.elements.timeDisplay) {
        this.elements.timeDisplay.textContent = `Time: 00:00 / ${this.formatTime(totalSeconds)}`;
      }

      // 初期ボリューム表示を更新
      if (this.options.showVolumeControl) {
        this.updateVolumeDisplay();
      }

      // 初期表示モードを設定（デフォルトはTime表示）
      this.updateDisplayMode();

      this.updateUIState();
    });
  }

  bindUIEvents(): void {
    // シークバー
    (this.elements.seek as HTMLInputElement).addEventListener('mousedown', (_e: MouseEvent) => {
      if (!this.isReady || this.isExporting) return;
      this.isDragging = true;
      this.wasPlayingBeforeDrag = this.movie.isPlaying;
      if (this.movie.isPlaying) {
        this.movie.pause();
        this.updatePlayButton();
      }
    });

    (this.elements.seek as HTMLInputElement).addEventListener('input', (e: Event) => {
      if (!this.isReady || this.isExporting || !this.isDragging) return;
      this.movie.gotoFrame(parseInt((e.target as HTMLInputElement).value));
    });

    this._mouseUpHandler = (_e: MouseEvent) => {
      if (!this.isDragging) return;
      this.isDragging = false;

      // ドラッグ前に再生中だった場合は再生を再開
      if (this.wasPlayingBeforeDrag) {
        this.movie.play();
        this.updatePlayButton();
      }
    };
    document.addEventListener('mouseup', this._mouseUpHandler);

    // 再生/一時停止ボタン
    (this.elements.playBtn as HTMLButtonElement).addEventListener('click', () => {
      if (!this.isReady || this.isExporting) return;

      if (this.movie.isPlaying) {
        this.movie.pause();
      } else {
        this.movie.play();
      }
      this.updatePlayButton();
    });

    // フレーム移動ボタン
    (this.elements.prevBtn as HTMLButtonElement).addEventListener('click', () => {
      if (!this.isReady || this.isExporting) return;
      let targetFrame = this.movie.currentFrame - 1;
      if (targetFrame < 0) targetFrame = 0;
      this.movie.gotoFrame(targetFrame);
    });

    (this.elements.nextBtn as HTMLButtonElement).addEventListener('click', () => {
      if (!this.isReady || this.isExporting) return;
      let targetFrame = this.movie.currentFrame + 1;
      if (targetFrame > this.movie.totalFrames) targetFrame = this.movie.totalFrames;
      this.movie.gotoFrame(targetFrame);
    });

    // エクスポートボタン
    if (this.elements.exportBtn) {
      this.elements.exportBtn.addEventListener('click', async () => {
        await this.handleExport();
      });
    }

    // ボリュームコントロール
    if (this.options.showVolumeControl) {
      (this.elements.volumeSlider as HTMLInputElement).addEventListener('input', (e: Event) => {
        if (this.isExporting) return;
        const volume = parseInt((e.target as HTMLInputElement).value) / 100;
        this.movie.volume = volume;
        if (this.movie.muted && volume > 0) {
          this.movie.muted = false; // ボリュームを上げたらミュート解除
        }
        this.updateVolumeDisplay();
      });

      (this.elements.muteBtn as HTMLButtonElement).addEventListener('click', () => {
        if (this.isExporting) return;
        this.movie.toggleMute();
        this.updateVolumeDisplay();
      });
    }

    // 表示切り替え
    if (this.elements.frameDisplay) {
      this.elements.frameDisplay.addEventListener('click', () => {
        if (this.isExporting) return;
        this.showFrameInfo = !this.showFrameInfo;
        this.updateDisplayMode();
      });
    }

    if (this.elements.timeDisplay) {
      this.elements.timeDisplay.addEventListener('click', () => {
        if (this.isExporting) return;
        this.showFrameInfo = !this.showFrameInfo;
        this.updateDisplayMode();
      });
    }
  }

  bindKeyboardEvents(): void {
    this._keyHandler = (e: KeyboardEvent) => {
      if (!this.isReady || this.isExporting || (e.target as HTMLElement).tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          (this.elements.playBtn as HTMLButtonElement).click();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          (this.elements.prevBtn as HTMLButtonElement).click();
          break;
        case 'ArrowRight':
          e.preventDefault();
          (this.elements.nextBtn as HTMLButtonElement).click();
          break;
        case 'KeyM':
          if (this.options.showVolumeControl) {
            e.preventDefault();
            (this.elements.muteBtn as HTMLButtonElement).click();
          }
          break;
      }
    };
    document.addEventListener('keydown', this._keyHandler);
  }

  // UI状態の更新
  updateUIState(): void {
    const disabled = !this.isReady || this.isExporting;
    (this.elements.playBtn as HTMLButtonElement).disabled = disabled;
    (this.elements.prevBtn as HTMLButtonElement).disabled = disabled;
    (this.elements.nextBtn as HTMLButtonElement).disabled = disabled;
    (this.elements.seek as HTMLInputElement).disabled = disabled;

    if (this.elements.exportBtn) {
      (this.elements.exportBtn as HTMLButtonElement).disabled = disabled;
    }

    if (this.options.showVolumeControl) {
      (this.elements.volumeSlider as HTMLInputElement).disabled = disabled;
      (this.elements.muteBtn as HTMLButtonElement).disabled = disabled;
    }
  }

  // 表示切り替え機能
  updateDisplayMode(): void {
    if (!this.elements.frameDisplay || !this.elements.timeDisplay) return;

    if (this.showFrameInfo) {
      this.elements.frameDisplay.classList.remove('hidden');
      this.elements.timeDisplay.classList.add('hidden');
    } else {
      this.elements.frameDisplay.classList.add('hidden');
      this.elements.timeDisplay.classList.remove('hidden');
    }
  }

  // 再生ボタンの更新
  updatePlayButton(): void {
    if (this.movie.isPlaying) {
      (this.elements.playBtn as HTMLButtonElement).textContent = '⏸';
    } else {
      (this.elements.playBtn as HTMLButtonElement).textContent = '▶';
    }
  }

  // ボリューム表示の更新
  updateVolumeDisplay(): void {
    if (!this.options.showVolumeControl) return;

    const isMuted = this.movie.muted;
    const volume = this.movie.volume;

    // ボリューム表示の更新
    (this.elements.volumeDisplay as HTMLElement).textContent = `${Math.round(volume * 100)}%`;
    (this.elements.volumeSlider as HTMLInputElement).value = String(Math.round(volume * 100));

    // ミュートボタンの表示更新
    if (isMuted) {
      (this.elements.muteBtn as HTMLButtonElement).textContent = '🔇';
      (this.elements.muteBtn as HTMLButtonElement).classList.add('muted');
      (this.elements.volumeSlider as HTMLInputElement).style.opacity = '0.5';
    } else {
      (this.elements.muteBtn as HTMLButtonElement).textContent = volume > 0.5 ? '🔊' : volume > 0 ? '🔉' : '🔈';
      (this.elements.muteBtn as HTMLButtonElement).classList.remove('muted');
      (this.elements.volumeSlider as HTMLInputElement).style.opacity = '1';
    }
  }

  // エクスポート処理
  async handleExport(): Promise<void> {
    if (!this.isReady || this.isExporting) return;

    // エクスポート開始
    this.isExporting = true;
    this.updateUIState();

    // プログレスバーを表示
    (this.elements.exportProgress as HTMLElement).style.display = 'flex';
    (this.elements.progressBar as HTMLElement).style.width = '0%';
    (this.elements.progressText as HTMLElement).textContent = '0% (0 / 0 フレーム)';

    // 再生中なら一時停止
    const wasPlaying = this.movie.isPlaying;
    if (wasPlaying) {
      this.movie.pause();
      this.updatePlayButton();
    }

    try {
      const blob = await this.movie.render();

      // プログレスバーを完了状態に
      (this.elements.progressBar as HTMLElement).style.width = '100%';
      (this.elements.progressText as HTMLElement).textContent = '完了！動画を生成中...';

      // 少し待ってから動画を表示
      setTimeout(() => {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(blob);
        video.controls = true;
        video.style.maxWidth = '100%';
        video.style.marginTop = '20px';
        document.body.appendChild(video);

        // プログレスバーを非表示
        (this.elements.exportProgress as HTMLElement).style.display = 'none';

        // エクスポート完了
        this.isExporting = false;
        this.updateUIState();

        // 元の再生状態を復元
        if (wasPlaying) {
          this.movie.play();
          this.updatePlayButton();
        }
      }, 500);

    } catch (error) {
      console.error('Export failed:', error);
      alert('エクスポートに失敗しました。');

      // プログレスバーを非表示
      (this.elements.exportProgress as HTMLElement).style.display = 'none';

      // エクスポート完了
      this.isExporting = false;
      this.updateUIState();

      // 元の再生状態を復元
      if (wasPlaying) {
        this.movie.play();
        this.updatePlayButton();
      }
    }
  }

  // 時間フォーマット関数
  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // コントローラーを破棄
  destroy(): void {
    if (this._mouseUpHandler) {
      document.removeEventListener('mouseup', this._mouseUpHandler);
    }
    if (this._keyHandler) {
      document.removeEventListener('keydown', this._keyHandler);
    }
    if (this.elements.controls) this.elements.controls.remove();
    if (this.elements.exportProgress) this.elements.exportProgress.remove();
    this.elements = {};
  }
}
