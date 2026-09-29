// Speech-to-script aligner for the floating teleprompter.
// Works in the browser (window.Aligner) and in Node (module.exports) for tests.
(function (root) {
  const STOP = new Set(
    (
      "a an the and or but so of to in on at for with from by as is was were be been are am " +
      "it its this that these those i you he she we they me my your our their his her them " +
      "there here what which who how when where why not no do did does done have has had " +
      "will would can could should just very then than also if into out up down about over " +
      "more most some any all each o a os as e de do da que em um uma para com por el la los " +
      "las y en un una del se"
    ).split(" "),
  );

  function norm(w) {
    return String(w || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function lev1(a, b) {
    // true when edit distance <= 1
    if (a === b) return true;
    const la = a.length,
      lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0,
      j = 0,
      edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) {
        i++;
        j++;
        continue;
      }
      if (++edits > 1) return false;
      if (la > lb) i++;
      else if (lb > la) j++;
      else {
        i++;
        j++;
      }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  function sim(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const na = a.match(/^\d+/),
      nb = b.match(/^\d+/);
    if (na || nb) return na && nb && na[0] === nb[0] ? 1 : 0;
    if (a.length >= 5 && b.length >= 5) {
      if (a.slice(0, 5) === b.slice(0, 5)) return 0.85; // company / companies
      if (lev1(a, b)) return 0.85;
    } else if (a.length >= 4 && b.length >= 4) {
      if (a.startsWith(b) || b.startsWith(a)) return 0.8; // spend / spending
    }
    return 0;
  }

  function weight(w) {
    return STOP.has(w) ? 0.25 : w.length <= 2 ? 0.4 : 1;
  }

  class Aligner {
    constructor(words) {
      this.setScript(words || []);
    }
    setScript(words) {
      this.script = words.map(norm);
      this.pos = -1; // index of the last script word considered spoken
      this.spoken = [];
      this.lastMatchAt = 0;
      this.missStreak = 0;
    }
    seek(i) {
      this.pos = Math.max(-1, Math.min(this.script.length - 1, i));
      this.spoken = [];
      this.missStreak = 0;
    }
    // Feed newly transcribed text. Returns the new position, or null when nothing moved.
    feed(text, now) {
      const toks = String(text || "")
        .split(/[\s\-‐-―/]+/)
        .map(norm)
        .filter(Boolean);
      if (!toks.length) return null;
      for (const t of toks) this.spoken.push(t);
      if (this.spoken.length > 40) this.spoken = this.spoken.slice(-40);
      return this._align(now || Date.now());
    }
    _align(now) {
      const S = this.script,
        n = S.length;
      if (!n) return null;
      const tail = this.spoken.slice(-12);
      const k = tail.length;
      const wide = this.missStreak >= 14; // lost: search the whole script
      const lo = wide ? 0 : Math.max(0, this.pos - 10);
      const hi = wide ? n : Math.min(n, this.pos + 60);
      const m = hi - lo;
      if (m <= 0) return null;
      const GAP_SPOKEN = 0.12, // I said a word that is not in the note
        GAP_SCRIPT = 0.3, // I skipped a word of the note
        MISMATCH = 0.7;
      let prev = new Float32Array(m + 1),
        cur = new Float32Array(m + 1);
      let best = { score: 0, j: -1 };
      for (let i = 1; i <= k; i++) {
        cur[0] = 0;
        const t = tail[i - 1];
        for (let j = 1; j <= m; j++) {
          const s = S[lo + j - 1];
          const sm = sim(t, s);
          const diag =
            prev[j - 1] + (sm > 0 ? sm * Math.max(weight(t), weight(s)) : -MISMATCH);
          const v = Math.max(0, diag, prev[j] - GAP_SPOKEN, cur[j - 1] - GAP_SCRIPT);
          cur[j] = v;
          // only alignments that end on a real match of one of the last 3 spoken words
          if (i >= k - 2 && sm > 0 && v === diag) {
            const idx = lo + j - 1;
            const dist = idx - (this.pos + 1);
            // a filler word alone may only nudge the position a few words ahead
            if (weight(s) < 1 && (dist < 0 || dist > 3)) continue;
            const pen = dist >= 0 ? dist * 0.02 : -dist * 0.12;
            const sc = v - pen;
            if (sc > best.score) best = { score: sc, j: idx, dist };
          }
        }
        const tmp = prev;
        prev = cur;
        cur = tmp;
      }
      let need = 1.15;
      if (best.j >= 0) {
        if (best.dist < 0) need = 2.6; // going back needs strong evidence
        else if (best.dist > 25) need = 2.4; // so does a long jump forward
        else if (best.dist > 8) need = 1.7;
      }
      if (best.j < 0 || best.score < need) {
        this.missStreak++;
        return null;
      }
      this.missStreak = 0;
      if (best.j === this.pos) return null;
      this.pos = best.j;
      this.lastMatchAt = now;
      return this.pos;
    }
  }

  const api = { Aligner, norm, sim };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AlignerLib = api;
})(typeof window !== "undefined" ? window : globalThis);
