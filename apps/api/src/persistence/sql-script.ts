/** Split a migration script without breaking a CREATE TRIGGER body. */
export function sqlStatements(script: string): string[] {
  const statements: string[] = [];
  let current = "";
  let block = false;
  for (const rawLine of script.replace(/\r/g, "").split("\n")) {
    const line = rawLine.trim();
    if (!current && (!line || line.startsWith("--"))) continue;
    current += `${rawLine}\n`;
    if (/^BEGIN\b/i.test(line)) block = true;
    if (block && /^END;?$/i.test(line)) block = false;
    if (!block && line.endsWith(";")) {
      statements.push(current.trim().replace(/;\s*$/, ""));
      current = "";
    }
  }
  if (current.trim()) statements.push(current.trim().replace(/;\s*$/, ""));
  return statements;
}
