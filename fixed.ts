/*
Sample 06: Missing await (LSP SHOULD catch in strict mode)
Calling an async function without await.
*/

async function fetchData(url: string): Promise<string> {
  return `data from ${url}`;
}

async function main(): Promise<void> {
  // BUG: missing await — returns Promise<string>, not string
  const data = await fetchData("/api/users");
  console.log(data.length); // error: data is Promise, not string
}

main();
