const { Raven } = require('./common');
const FileReceiver = require('./fileReceiver');
const { notify, gcmCompliant } = require('./utils');
const bytes = require('bytes');
const Storage = require('./storage');
const storage = new Storage(localStorage);
const links = require('./links');
const metrics = require('./metrics');

const $ = require('jquery');
require('jquery-circle-progress');

$(document).ready(function() {
  gcmCompliant()
    .then(function() {
      const filename = $('#dl-filename').text();
      const bytelength = Number($('#dl-bytelength').text());
      const timeToExpiry = Number($('#dl-ttl').text());

      //initiate progress bar
      $('#dl-progress').circleProgress({
        value: 0.0,
        startAngle: -Math.PI / 2,
        fill: '#3B9DFF',
        size: 158,
        animation: { duration: 300 }
      });
      $('#download-btn').click(download);
      function download() {
        // Disable the download button to avoid accidental double clicks.
        $('#download-btn').attr('disabled', 'disabled');
        links.setOpenInNewTab(true);

        const fileReceiver = new FileReceiver();

        fileReceiver.on('progress', progress => {
          window.onunload = function() {
            metrics.cancelledDownload({ size: bytelength });
          };

          $('#download-page-one').attr('hidden', true);
          $('#download-progress').removeAttr('hidden');
          const percent = progress[0] / progress[1];
          // update progress bar
          $('#dl-progress').circleProgress('value', percent);
          $('.percent-number').text(`${Math.floor(percent * 100)}`);
          $('.progress-text').text(
            `${filename} (${bytes(progress[0], {
              decimalPlaces: 1,
              fixedDecimals: true
            })} of ${bytes(progress[1], { decimalPlaces: 1 })})`
          );
        });

        let downloadEnd;
        fileReceiver.on('decrypting', isStillDecrypting => {
          // The file is being decrypted
          if (isStillDecrypting) {
            fileReceiver.removeAllListeners('progress');
            window.onunload = null;
            document.l10n.formatValue('decryptingFile').then(decryptingFile => {
              $('.progress-text').text(decryptingFile);
            });
          } else {
            downloadEnd = Date.now();
          }
        });

        fileReceiver.on('hashing', isStillHashing => {
          // The file is being hashed to make sure a malicious user hasn't tampered with it
          if (isStillHashing) {
            document.l10n.formatValue('verifyingFile').then(verifyingFile => {
              $('.progress-text').text(verifyingFile);
            });
          } else {
            $('.progress-text').text(' ');
            document.l10n
              .formatValues('downloadNotification', 'downloadFinish')
              .then(translated => {
                notify(translated[0]);
                $('.title').text(translated[1]);
              });
          }
        });

        const startTime = Date.now();

        metrics.startedDownload({ size: bytelength, ttl: timeToExpiry });

        fileReceiver
          .download()
          .catch(err => {
            metrics.stoppedDownload({ size: bytelength, err });

            if (err.message === 'notfound') {
              location.reload();
            } else {
              document.l10n.formatValue('errorPageHeader').then(translated => {
                $('.title').text(translated);
              });
              $('#download-btn').attr('hidden', true);
              $('#expired-img').removeAttr('hidden');
            }
            throw err;
          })
          .then(([decrypted, fname]) => {
            const endTime = Date.now();
            const time = endTime - startTime;
            const downloadTime = endTime - downloadEnd;
            const speed = bytelength / (downloadTime / 1000);
            storage.totalDownloads += 1;
            metrics.completedDownload({ size: bytelength, time, speed });

            const dataView = new DataView(decrypted);
            const blob = new Blob([dataView]);
            const downloadUrl = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = downloadUrl;
            if (window.navigator.msSaveBlob) {
              // if we are in microsoft edge or IE
              window.navigator.msSaveBlob(blob, fname);
              return;
            }
            a.download = fname;
            document.body.appendChild(a);
            a.click();
          })
          .catch(err => {
            Raven.captureException(err);
            return Promise.reject(err);
          })
          .then(() => links.setOpenInNewTab(false));
      }
    })
    .catch(err => {
      metrics.unsupported({ err }).then(() => {
        location.replace('/unsupported/gcm');
      });
    });
});
