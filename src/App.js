import React, { Component, PureComponent } from 'react';
import { Editor, EditorState, ContentState, RichUtils } from 'draft-js';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import faker from 'faker';
import times from 'lodash/times';

const Wrapper = styled.main`
  position: fixed;
  top: 0;
  display: flex;
  flex-direction: column;
  left: 0;
  width: 100%;
  height: 100%;
`

const Pagination = styled.aside`
  background: #eee;
  width: 100%;
  height: 50px;
`

const text = times(2000, faker.lorem.sentence).join('\n')

const frame = 100

class DraftPaginator extends PureComponent {
  state = {
    index: 0,
    range: 300,
  }

  truncate = () => {
    // get block map
    const { index, range } = this.state
    const editorState = EditorState.createEmpty()
    const content = this.props.editorState.getCurrentContent();
    const blockMap = content.getBlockMap().slice(index, index + range);
    // set state with truncated content
    const truncatedEditorState = EditorState.push(
      editorState,
      content.set('blockMap', blockMap)
    )

    return EditorState.forceSelection(truncatedEditorState, this.props.editorState.getSelection())
  }

  onChange = (editorState) => {
    const { index, range } = this.state
    const content = this.props.editorState.getCurrentContent();
    const blockMap = content.getBlockMap()

    // get first, last and truncated chunk
    const first = blockMap.slice(0, index)
    const last = blockMap.slice(index + range)
    const middle = editorState.getCurrentContent().getBlockMap()

    const merged = first.toKeyedSeq().concat(middle, last).toOrderedMap()

    const mergedEditorState = EditorState.push(
      this.props.editorState,
      content.set('blockMap', merged)
    );

    const focusedEditorState = EditorState.forceSelection(mergedEditorState, editorState.getSelection());
    this.props.onChange(focusedEditorState)
  }

  render() {
    return this.props.children({
      editorState: this.truncate(),
      onChange: this.onChange
    });
  }
}

DraftPaginator.propTypes = {
  onChange: PropTypes.func,
  editorState: PropTypes.object
}


class App extends Component {
  state = {
    editorState: EditorState.createWithContent(ContentState.createFromText(text)),
  }

  onChange = (editorState) => {
    this.setState({ editorState });
  };

  render() {
    return (
      <Wrapper>
        <DraftPaginator
          onChange={this.onChange}
          editorState={this.state.editorState}
        >
          {({ editorState, onChange }) => (
            <Editor
              editorState={editorState}
              onChange={onChange}
            />
          )}
        </DraftPaginator>
        <Pagination>
          <input type="text" />
        </Pagination>
      </Wrapper>
    );
  }
}

export default App;
