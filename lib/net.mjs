// Some networks' system resolver fails for a host that plain DNS answers; fall back to a direct query, and to the
// last address that worked when both fail for a moment.
import { Agent, setGlobalDispatcher } from "undici";
import dns from "node:dns";

const known = new Map();
const lookup = (host, opts, cb) => {
  const ok = addrs => { known.set(host, addrs); opts.all ? cb(null, addrs.map(a => ({ address: a, family: 4 }))) : cb(null, addrs[0], 4); };
  dns.lookup(host, { ...opts, family: 4, all: true }, (err, list) => {
    if (!err) return ok(list.map(x => x.address));
    dns.resolve4(host, (e2, addrs) => !e2 ? ok(addrs) : known.has(host) ? ok(known.get(host)) : cb(err));
  });
};
export const dispatcher = new Agent({ connect: { lookup } });
setGlobalDispatcher(dispatcher); // the built-in fetch (chain proxy, key lookups) uses it too
