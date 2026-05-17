"""
Sample 09 FIX: Return type matches the interface exactly.
"""

type User = { id: number; name: string };

function createUser(id: number, name: string): User {
  if (id === 0) {
    return { id: 0, name: "root" }; // FIXED: removed excess 'role'
  }
  return { id, name };
}

function main(): void {
  const user = createUser(1, "Alice");
  console.log(user.name);
}

main();
