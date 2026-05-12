// Alias for ./_health that Vercel's filesystem router can serve.
// Vercel treats leading-underscore filenames as private and 404s them
// even via explicit rewrites; this non-underscore filename works.
module.exports = require('./_health');
