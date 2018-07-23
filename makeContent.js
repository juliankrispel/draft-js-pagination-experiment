const Draft = require('draft-js');
const { convertToRaw, EditorState, ContentState, RichUtils } = Draft;
const faker = require('faker');
const fs = require('fs');
const times = require('lodash/times');

const rawContent = {
  "entityMap": {},
  "blocks": times(1000, faker.lorem.sentence).map(val => ({
    "text": val,
  }))
};

fs.writeFileSync(
  'src/mock.json',
  JSON.stringify(rawContent, null, 2),
);
