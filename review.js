// Moderate suggestions. List: node review.js   Approve: node review.js approve 1 3   Reject: node review.js reject 2
const fs=require("fs"),F=__dirname+"/data.json";
let d={};try{d=JSON.parse(fs.readFileSync(F,"utf8"))}catch(e){}
d.sugg=d.sugg||[];d.extra=d.extra||[];
const pend=d.sugg.filter(x=>x.st==="pending"),[cmd,...nums]=process.argv.slice(2);
if(!cmd){console.log(pend.length?pend.map((x,i)=>(i+1)+". "+x.q).join("\n"):"No pending suggestions.");console.log("\nApprove: node review.js approve 1 3\nReject:  node review.js reject 2")}
else{nums.map(n=>pend[n-1]).filter(Boolean).forEach(x=>{if(cmd==="approve"){x.st="approved";d.extra.push({id:"c-"+x.id,q:x.q,s:""})}else x.st="rejected"});fs.writeFileSync(F,JSON.stringify(d));console.log("Done.")}
