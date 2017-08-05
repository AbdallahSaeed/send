const testPilotGA = require('testpilot-ga');
const Storage = require('./storage');
const storage = new Storage(localStorage);

const analytics = new testPilotGA({
  an: 'Firefox Send',
  ds: 'web',
  tid: window.GOOGLE_ANALYTICS_ID
});

const audience = location.pathname.includes('/download')
  ? 'recipient'
  : 'sender';

document.addEventListener('DOMContentLoaded', function() {
  addExitHandlers();
  addRestartHandlers();
});

function sendEvent() {
  return analytics.sendEvent.apply(analytics, arguments).catch(() => 0);
}

function urlToMetric(url) {
  switch (url) {
    case 'https://www.mozilla.org/':
      return 'mozilla';
    case 'https://www.mozilla.org/about/legal':
      return 'legal';
    case 'https://testpilot.firefox.com/about':
      return 'about';
    case 'https://testpilot.firefox.com/privacy':
      return 'privacy';
    case 'https://testpilot.firefox.com/terms':
      return 'terms';
    case 'https://www.mozilla.org/privacy/websites/#cookies':
      return 'cookies';
    case 'https://github.com/mozilla/send':
      return 'github';
    case 'https://twitter.com/FxTestPilot':
      return 'twitter';
    case 'https://www.mozilla.org/firefox/new/?scene=2':
      return 'download-firefox';
    default:
      return 'other';
  }
}

function setReferrer(state) {
  if (audience === 'sender') {
    if (state) {
      storage.referrer = `${state}-upload`;
    }
  } else if (audience === 'recipient') {
    if (state) {
      storage.referrer = `${state}-download`;
    }
  }
}

function externalReferrer() {
  if (/^https:\/\/testpilot\.firefox\.com/.test(document.referrer)) {
    return 'testpilot';
  }
  return 'external';
}

function takeReferrer() {
  const referrer = storage.referrer || externalReferrer();
  storage.referrer = null;
  return referrer;
}

function startedUpload(params) {
  return sendEvent('sender', 'upload-started', {
    cm1: params.size,
    cm5: storage.totalUploads,
    cm6: storage.numFiles + 1,
    cm7: storage.totalDownloads,
    cd1: params.type,
    cd5: takeReferrer()
  });
}

function cancelledUpload(params) {
  storage.referrer = 'cancelled-upload';
  return sendEvent('sender', 'upload-stopped', {
    cm1: params.size,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd1: event.type === 'drop' ? 'drop' : 'click',
    cd2: 'cancelled'
  });
}

function completedUpload(params) {
  return sendEvent('sender', 'upload-stopped', {
    cm1: params.size,
    cm2: params.time,
    cm3: params.speed,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd1: params.type,
    cd2: 'completed'
  });
}

function startedDownload(params) {
  return sendEvent('recipient', 'download-started', {
    cm1: params.size,
    cm4: params.ttl,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads
  });
}

function stoppedDownload(params) {
  return sendEvent('recipient', 'download-stopped', {
    cm1: params.size,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd2: 'errored',
    cd6: params.err
  });
}

function cancelledDownload(params) {
  storage.referrer = 'cancelled-download';
  return sendEvent('recipient', 'download-stopped', {
    cm1: params.size,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd2: 'cancelled'
  });
}

function stoppedUpload(params) {
  return sendEvent('sender', 'upload-stopped', {
    cm1: params.size,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd1: params.type,
    cd2: 'errored',
    cd6: params.err
  });
}

function completedDownload(params) {
  storage.referrer = 'completed-download';
  // record download-stopped (completed) by recipient
  return sendEvent('recipient', 'download-stopped', {
    cm1: params.size,
    cm2: params.time,
    cm3: params.speed,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd2: 'completed'
  });
}

function deletedUpload(params) {
  return sendEvent('sender', 'upload-deleted', {
    cm1: params.size,
    cm2: params.time,
    cm3: params.speed,
    cm4: params.ttl,
    cm5: storage.totalUploads,
    cm6: storage.numFiles,
    cm7: storage.totalDownloads,
    cd1: params.type,
    cd4: params.location
  });
}

function unsupported(params) {
  return sendEvent(audience, 'unsupported', {
    cd6: params.err
  });
}

function copiedLink(params) {
  return sendEvent(audience, 'copied', {
    cd4: params.location
  });
}

function exitEvent(target) {
  return sendEvent(audience, 'exited', {
    cd3: urlToMetric(target.currentTarget.href)
  });
}

function addExitHandlers() {
  const links = document.querySelectorAll('a');
  links.forEach(l => {
    if (l.href.indexOf('http') > -1) {
      l.addEventListener('click', exitEvent);
    }
  });
}

function restartEvent(state) {
  setReferrer(state);
  return sendEvent(audience, 'restarted', {
    cd2: state
  });
}

function addRestartHandlers() {
  const elements = document.querySelectorAll('.send-new');
  elements.forEach(el => {
    const state = el.getAttribute('data-state');
    el.addEventListener('click', restartEvent.bind(null, state));
  });
}

module.exports = {
  copiedLink,
  startedUpload,
  cancelledUpload,
  stoppedUpload,
  completedUpload,
  deletedUpload,
  startedDownload,
  cancelledDownload,
  stoppedDownload,
  completedDownload,
  unsupported
};
