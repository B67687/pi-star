/*
Sample 09: Wrong return type (LSP SHOULD catch)
Function claims to return User but returns a different shape.
*/

type User = { id: number; name: string };
type Admin = { id: number; name: string; role: string };

// BUG: declares User return but returns Admin (extra property)
// In strict mode, TypeScript catches this via excess property checking
// Only in object literals though, so this might not fire...
function createUser(id: number, name: string): User {
  if (id === 0) {
    return { id: 0, name: "root", role: "admin" }; // BUG: extra 'role' property
  }
  return { id, name };
}

function main(): void {
  const user = createUser(1, "Alice");
  console.log(user.name);
}

main();
