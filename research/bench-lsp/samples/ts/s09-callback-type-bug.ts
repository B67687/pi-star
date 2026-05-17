/*
Sample 09: Wrong callback type signature (LSP SHOULD catch)
Passing a callback with wrong parameter types.
*/

type User = { id: number; name: string };

function fetchUsers(): Promise<User[]> {
  return Promise.resolve([{ id: 1, name: "Alice" }]);
}

function processUsers(
  users: User[],
  transform: (u: User) => string
): string[] {
  return users.map(transform);
}

// BUG: callback expects (u: User) => string, but name access
// is correct. The bug is that transform also has a second
// parameter 'index' — but wait, that's fine in JS.
//
// Real bug: the callback parameter type is actually wrong
function main(): void {
  fetchUsers().then((users) => {
    // BUG: map also passes index, but the callback receives both
    // _and_ uses index as a string — no type error reported
    const names = processUsers(users, (u: User, index: number) => {
      return `${index + 1}. ${u.name}`;
    });
    console.log(names);
  });
}

main();
