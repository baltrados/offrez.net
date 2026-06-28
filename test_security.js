import { escapeHtml, sanitizeUrl, truncateText, isValidEmail } from ./js/security.js;
let failed = 0;
const assert = (cond, msg) => { if(!cond) { console.error(FAIL:  + msg); failed++; } else { console.log(PASS:  + msg); } };
assert(escapeHtml(<script>alert(1)</script>) === &lt;script&gt;alert(1)&lt;/script&gt;, UT-01);
assert(escapeHtml(null) === ", UT-02);
assert(sanitizeUrl(https://www.amazon.fr/dp/B08XYZ) === https://www.amazon.fr/dp/B08XYZ, UT-03);
assert(sanitizeUrl(https://evil.com/hack) === #, UT-04);
assert(truncateText(A &amp; B, 10).indexOf(A &amp; B) !== -1, UT-05);
assert(isValidEmail(test@example.com) === true, UT-06);
assert(isValidEmail(not-an-email) === false, UT-07);
process.exit(failed > 0 ? 1 : 0);
EOF
node ~/offrly/test_security.js; rm ~/offrly/test_security.js
