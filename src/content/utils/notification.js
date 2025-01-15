// 创建通知容器
function createNotificationContainer() {
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 100000;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }
  return container;
}

// 显示通知
function showNotification(message, type = 'info') {
  // 添加全局样式
  const style = document.createElement('style');
  style.textContent = `
    @keyframes notificationSlideIn {
      from {
        transform: translateY(-100%);
        opacity: 0;
      }
      to {
        transform: translateY(0);
        opacity: 1;
      }
    }

    @keyframes notificationSlideOut {
      from {
        transform: translateY(0);
        opacity: 1;
      }
      to {
        transform: translateY(-100%);
        opacity: 0;
      }
    }

    @keyframes progressBar {
      from {
        width: 100%;
      }
      to {
        width: 0%;
      }
    }
  `;
  document.head.appendChild(style);

  // 移除现有的通知
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.style.animation = 'notificationSlideOut 0.3s ease forwards';
    setTimeout(() => {
      existingNotification.remove();
    }, 300);
  }

  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    border-radius: 8px;
    color: white;
    font-size: 14px;
    z-index: 10002;
    display: flex;
    align-items: center;
    gap: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    animation: notificationSlideIn 0.3s ease forwards;
    cursor: pointer;
    transition: transform 0.2s ease;
  `;

  // 根据类型设置样式
  switch (type) {
    case 'success':
      notification.style.background = '#4caf50';
      break;
    case 'warning':
      notification.style.background = '#ff9800';
      break;
    case 'error':
      notification.style.background = '#f44336';
      break;
    default:
      notification.style.background = '#2196f3';
  }

  // 添加图标
  const icon = document.createElement('span');
  icon.style.cssText = `
    font-size: 18px;
    line-height: 1;
  `;
  switch (type) {
    case 'success':
      icon.textContent = '✓';
      break;
    case 'warning':
      icon.textContent = '⚠';
      break;
    case 'error':
      icon.textContent = '✕';
      break;
    default:
      icon.textContent = 'ℹ';
  }

  // 添加进度条
  const progressBar = document.createElement('div');
  progressBar.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    height: 3px;
    width: 100%;
    background: rgba(255, 255, 255, 0.3);
  `;

  const progress = document.createElement('div');
  progress.style.cssText = `
    height: 100%;
    width: 100%;
    background: rgba(255, 255, 255, 0.7);
    animation: progressBar 3s linear forwards;
  `;

  progressBar.appendChild(progress);

  // 添加悬停效果
  notification.addEventListener('mouseenter', () => {
    notification.style.transform = 'translateX(-50%) scale(1.02)';
    progress.style.animationPlayState = 'paused';
  });

  notification.addEventListener('mouseleave', () => {
    notification.style.transform = 'translateX(-50%) scale(1)';
    progress.style.animationPlayState = 'running';
  });

  // 点击关闭
  notification.addEventListener('click', () => {
    notification.style.animation = 'notificationSlideOut 0.3s ease forwards';
    setTimeout(() => {
      notification.remove();
    }, 300);
  });

  notification.appendChild(icon);
  notification.appendChild(document.createTextNode(message));
  notification.appendChild(progressBar);
  document.body.appendChild(notification);

  // 3秒后自动关闭
  setTimeout(() => {
    if (document.body.contains(notification)) {
      notification.style.animation = 'notificationSlideOut 0.3s ease forwards';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }
  }, 3000);
}

// 导出函数
window.showNotification = showNotification;