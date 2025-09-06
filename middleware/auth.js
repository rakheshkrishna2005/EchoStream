export function authenticate(req, res, next) {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer "))
      return res.status(401).json({ error: "Unauthorized" });
    const token = header.slice("Bearer ".length).trim();
    if (token !== process.env.API_BEARER_TOKEN)
      return res.status(403).json({ error: "Forbidden" });
    next();
  }
  