import process from "node:process";

console.log(process.argv[1])
console.log(process.argv[2])

console.log(import.meta.url)
console.log(import.meta.dirname)
console.log(import.meta.filename)