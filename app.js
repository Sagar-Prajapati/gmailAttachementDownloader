const _ = require('lodash');
const fs = require('fs');
const atob = require('atob');
const inquirer = require('inquirer');
const path = require('path');

const AuthTheUser = require('./funct/auth');
const { file } = require('googleapis/build/src/apis/file');
let gmail;

//client authentication(1)
AuthTheUser.getAuthAndGmail(main);

//main function to run(2)
function main(auth, gmailInstance) {
  let coredata = {};
  let workflow;
  gmail = gmailInstance;
  workflow = downloadFromThisEmailId;
  workflow(auth, gmail, coredata)
    .then((mailList) => {
      coredata.mailList = mailList;
      return fetchMailsByMailIds(auth, mailList);
    })
    .then((mails) => {
      coredata.attachments = pluckAllAttachments(mails);
      return fetchAndSaveAttachments(auth, coredata.attachments);
    })
    .then(() => {
      console.log('Done');
    })
    .catch((e) => console.log(e));
}

//getting emailID from console and fetching the list of mail from gmail for that ID(3)
const downloadFromThisEmailId = (auth) => {
     return askForMail()
        .then((mailId) => {
          return getListOfMailIdByFromId(auth, mailId);
        });
}

//request user to enter mailID from which to fetch(4)
function askForMail() {
  return inquirer.prompt([
    {
      type: 'input',
      name: 'from',
      message: 'Enter from mailId:'
    }
  ])
  .then(answers => answers.from);
}

//gmail api request for list of mail in this particular ID(5)
function getListOfMailIdByFromId(auth, mailId) {
  return new Promise((resolve, reject) => {
    gmail.users.messages.list({
        auth: auth,
        userId: 'me',
        q: 'from:' + mailId +' '+ 'is:unread',                    
      }, function(err, response) {
        if (err) {
          console.log('The API returned an error: ' + err);
          reject(err);
        }
        resolve(response.data.messages);
      });
  });
}

//fetch mail by email message ID (6)
async function fetchMailsByMailIds(auth, mailList) {
  let results = [];
   let promises = [];
  for(index in mailList) {
    promises.push(getMail(auth, mailList[index].id));
  };
  mails = await Promise.all(promises);
  _.merge(results, mails);
  return results;
}

//fetching messages from gmail api(7)
function getMail(auth, mailId) {
  return new Promise((resolve, reject) => {
    gmail.users.messages.get({
      userId: 'me',
      id: mailId,
      auth,
    }, (err, response) => {
      if (err) {
        reject(err);
      }
      resolve(response);
    })
  })
}
//getting data from attachements(8)
function pluckAllAttachments(mails) {
  return _.compact(_.flatten(_.map(mails, (m) => {
    if (!m.data || !m.data.payload || !m.data.payload.parts) {
      return undefined;
    }
    return _.map(m.data.payload.parts, (p) => {
      if (!p.body || !p.body.attachmentId) {
        return undefined;
      }
      const attachment = {
        mailId: m.data.id,
        name: p.filename,
        id: p.body.attachmentId
      };
      return attachment;
    })
  })));
}

//fetching mail messages from emailID received from gmail.(9)
async function fetchAndSaveAttachments(auth, attachments) {
  let results = [];
  let promises = [];
  for (index in attachments) {
    if (attachments[index].id) {
      promises.push(fetchAndSaveAttachment(auth, attachments[index]));
    }
  }
  attachs = await Promise.all(promises);
  _.merge(results, attachs);
  return results;
}
//fetching attachements from that ID(10)
function fetchAndSaveAttachment(auth, attachment) {
  return new Promise((resolve, reject) => {
    gmail.users.messages.attachments.get({
      auth: auth,
      userId: 'me',
      messageId: attachment.mailId,
      id: attachment.id
    }, function(err, response) {
      if (err) {
        console.log('The API returned an error: ' + err);
        reject(err);
      }
      if (!response) {
        console.log('Empty response: ' + response);
        reject(response);
      }
      var data = response.data.data.split('-').join('+');
      data = data.split('_').join('/');
      var content = fixBase64(data);
      resolve(content);
    });
  })
  .then((content) => {
     const folder = 'Downloaded_Attach/';
     var now = new Date();
     var todaysDate = now.getDate()+"-"+(now.getMonth()+1)+"-"+now.getFullYear();
     var newFolderName = folder+todaysDate;
     if(!fs.existsSync(newFolderName)){
        fs.mkdirSync(newFolderName);
     }
    var fileName = path.resolve(__dirname, newFolderName, attachment.name);
    return isFileExist(fileName)
      .then((isExist) => {
        if (isExist) {
          return getNewFileName(fileName);
        }
        return fileName;
      })
      .then((availableFileName) => {
        return saveFile(availableFileName, content);
      })
  })
}


//decoding the messagepart response received from gmail(11)
function fixBase64(binaryData) {
  const base64str = binaryData
  const binary = atob(base64str.replace(/\s/g, ''));
  const len = binary.length;       
  const buffer = new ArrayBuffer(len); 
  const view = new Uint8Array(buffer); 
  for (let i = 0; i < len; i++) {
    view[i] = binary.charCodeAt(i);
  }
  return view;
}

//checking that if file is already present or not(12)
function isFileExist(fileName) {
  return new Promise((resolve, reject) => {
    fs.stat(fileName, (err) => {
      if (err) {
        resolve(false);
      }
      resolve(true);
    })
  });
}


//if filename is already present,then create new file name of this new file(13)
//this getNewFileName will work only for pdf file
function getNewFileName(fileName) {
  return fileName.split('.')[0] + ' (' + Date.now() + ')' +  fileName.split('.')[1]+'.pdf';
}

//save file to the destination(14)
function saveFile(fileName, content) {
  return new Promise((resolve, reject) => {
    fs.writeFile(fileName, content, function(err) {
      if(err) {
          reject(err);
      }
      resolve(`${fileName} file was saved!`);
    });
  });
}

