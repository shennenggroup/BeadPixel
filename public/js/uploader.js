/**
 * 图片上传组件
 */

class Uploader {
  constructor() {
    this.uploadArea = document.getElementById('uploadArea');
    this.fileInput = document.getElementById('fileInput');
    this.selectFileBtn = document.getElementById('selectFileBtn');
    this.progressContainer = document.getElementById('uploadProgress');
    this.progressFill = this.progressContainer.querySelector('.progress-fill');
    this.progressText = this.progressContainer.querySelector('.progress-text');
    
    this.init();
  }

  init() {
    // 点击选择文件
    this.selectFileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.fileInput.click();
    });

    // 点击上传区域
    this.uploadArea.addEventListener('click', () => {
      this.fileInput.click();
    });

    // 文件选择
    this.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFile(e.target.files[0]);
      }
    });

    // 拖拽事件
    this.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.uploadArea.classList.add('dragover');
    });

    this.uploadArea.addEventListener('dragleave', () => {
      this.uploadArea.classList.remove('dragover');
    });

    this.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.uploadArea.classList.remove('dragover');
      
      if (e.dataTransfer.files.length > 0) {
        this.handleFile(e.dataTransfer.files[0]);
      }
    });
  }

  async handleFile(file) {
    // 验证文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.showToast('只支持 JPG、PNG、WebP 格式的图片', 'error');
      return;
    }

    // 验证文件大小（10MB）
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      this.showToast('文件大小不能超过 10MB', 'error');
      return;
    }

    // 显示进度条
    this.progressContainer.classList.remove('hidden');
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '上传中...';

    try {
      // 上传文件
      const formData = new FormData();
      formData.append('image', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (result.success) {
        this.progressFill.style.width = '100%';
        this.progressText.textContent = '上传成功！';
        
        this.showToast('图片上传成功', 'success');
        
        // 触发上传成功事件
        this.onUploadSuccess(result);
        
        // 隐藏进度条
        setTimeout(() => {
          this.progressContainer.classList.add('hidden');
        }, 2000);
      } else {
        throw new Error(result.message || '上传失败');
      }
    } catch (error) {
      console.error('上传失败:', error);
      this.showToast('上传失败: ' + error.message, 'error');
      this.progressContainer.classList.add('hidden');
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }

  onUploadSuccess(result) {
    // 这个方法会被 app.js 覆盖
    console.log('上传成功:', result);
  }
}
