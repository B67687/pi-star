/*
Sample 06 FIX: Added await before async function call.
*/

async function fetchData(url: string): Promise<string> {
  return `data from ${url}`;
}

async function main(): Promise<void> {
  // FIXED: await the Promise before using it
  const data = await fetchData("/api/users");
  console.log(data.length); // now correctly a string
}

main();
