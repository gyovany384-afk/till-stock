// THE PHONE'S HALF OF THE INVOICE TEST — 4 Nov 2026. Shrinks a photo of a supplier invoice
// so it can travel, and puts a database status into plain words. It sends nothing itself
// and it is on its own so a test can run it without a browser.
//
// Loaded by invoice.html; also required by tests/invoice-send.test.cjs.

var InvoiceSend = (function(){
  // The longest side after shrinking. The Windows reader on the desktop wants the print
  // big enough to read, so this is generous: a phone photo is 4000+ pixels across, and an
  // invoice at 1600 starts losing its small figures.
  var MAX_SIDE = 2400;
  // The most base64 characters the database takes (1,500,000), with room to spare.
  var LIMIT = 1400000;
  // Tried best-first: the first that fits is the one sent. Past the last, the picture is
  // made smaller instead.
  var QUALITIES = [0.85, 0.75, 0.65, 0.55, 0.45];
  var SHRINK = 0.8;
  var SMALLEST = 900;

  // The size a picture is drawn at: never larger than it came, never longer than `max`.
  function fitSize(w, h, max){
    w = Number(w) || 0; h = Number(h) || 0;
    if (w <= 0 || h <= 0) return { w: 0, h: 0 };
    var longest = Math.max(w, h);
    if (longest <= max) return { w: Math.round(w), h: Math.round(h) };
    var k = max / longest;
    return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
  }

  // 'data:image/jpeg;base64,AAAA' -> 'AAAA'. The database stores bare base64.
  function bareBase64(dataUrl){
    var s = String(dataUrl == null ? '' : dataUrl);
    var i = s.indexOf(',');
    return i === -1 ? '' : s.slice(i + 1);
  }

  function fits(b64){ return typeof b64 === 'string' && b64.length > 0 && b64.length <= LIMIT; }

  // invoice-20261104-153045.jpg — the desktop reads the extension to know what it was given,
  // and a name that sorts by time tells the pictures apart on both screens.
  function nameFor(when, ext){
    var d = when instanceof Date ? when : new Date();
    var p = function(n){ return (n < 10 ? '0' : '') + n; };
    return 'invoice-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.' + (ext || 'jpg');
  }

  // A PDF from the Files app (a supplier's emailed invoice) — by its type, or by its name when
  // the phone gives the file no type, which iOS does for some files.
  function isPdf(file){
    if (!file) return false;
    return /^application\/pdf$/i.test(file.type || '') || /\.pdf$/i.test(file.name || '');
  }

  // The file's bytes as base64, in steps so a big file cannot overflow the call stack.
  function base64OfFile(file){
    return file.arrayBuffer().then(function(buf){
      var bytes = new Uint8Array(buf), bin = '', STEP = 0x8000;
      for (var i = 0; i < bytes.length; i += STEP) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + STEP));
      return btoa(bin);
    });
  }

  // A PDF cannot be shrunk on a phone the way a photo can, so it goes as it is — or not at all.
  function sendablePdf(file){
    return base64OfFile(file).then(function(b64){
      if (!fits(b64)) throw new Error('That PDF is too big to send (about 1 MB at most). Take a photo of it, or screenshot it, instead.');
      return { b64: b64, name: nameFor(new Date(), 'pdf'), preview: '' };
    });
  }

  // Whatever was picked, made ready to send: a PDF as it is, a picture shrunk.
  function prepare(file, doc){
    if (isPdf(file)) return sendablePdf(file);
    return shrink(file, doc);
  }

  // One line of what happened to a picture, from the status the database keeps.
  function describe(row){
    var note = row && row.note ? String(row.note) : '';
    if (!row || row.status === 'waiting') return { tone: 'wait', text: 'Waiting for the desktop…' };
    if (row.status === 'read') return { tone: 'ok', text: '✓ Read on the desktop' + (note ? ' — ' + note : '') };
    return { tone: 'bad', text: 'Could not be read' + (note ? ' — ' + note : '') + '. Try another photo.' };
  }

  // Draws the picture smaller on a canvas until it fits. Resolves { b64, name, preview } or
  // rejects with a message a person can act on.
  function shrink(file, doc){
    doc = doc || (typeof document !== 'undefined' ? document : null);
    return new Promise(function(resolve, reject){
      if (!file || !/^image\//i.test(file.type || '')){ reject(new Error('That is not a picture or a PDF. Take a photo or choose a picture or PDF.')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onerror = function(){ URL.revokeObjectURL(url); reject(new Error('That picture could not be opened.')); };
      img.onload = function(){
        try {
          var side = MAX_SIDE;
          for (;;){
            var size = fitSize(img.naturalWidth, img.naturalHeight, side);
            var canvas = doc.createElement('canvas');
            canvas.width = size.w; canvas.height = size.h;
            var ctx = canvas.getContext('2d');
            // White first: a transparent corner would otherwise come out black in a JPEG.
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size.w, size.h);
            ctx.drawImage(img, 0, 0, size.w, size.h);
            for (var q = 0; q < QUALITIES.length; q++){
              var dataUrl = canvas.toDataURL('image/jpeg', QUALITIES[q]);
              var b64 = bareBase64(dataUrl);
              if (fits(b64)){
                URL.revokeObjectURL(url);
                resolve({ b64: b64, name: nameFor(new Date()), preview: dataUrl });
                return;
              }
            }
            side = Math.round(side * SHRINK);
            if (side < SMALLEST){ URL.revokeObjectURL(url); reject(new Error('That picture is too big to send. Try taking it again closer.')); return; }
          }
        } catch (e){
          URL.revokeObjectURL(url);
          reject(new Error('That picture could not be shrunk.'));
        }
      };
      img.src = url;
    });
  }

  return { MAX_SIDE: MAX_SIDE, LIMIT: LIMIT, QUALITIES: QUALITIES, fitSize: fitSize, bareBase64: bareBase64, fits: fits, nameFor: nameFor, describe: describe, shrink: shrink, isPdf: isPdf, base64OfFile: base64OfFile, prepare: prepare };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = InvoiceSend;
