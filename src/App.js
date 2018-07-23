import React, { Component, PureComponent } from 'react'
import { findDOMNode } from 'react-dom'
import { convertFromRaw, convertToRaw, Editor, EditorState, ContentState, RichUtils } from 'draft-js'
import PropTypes from 'prop-types'
import Immutable from 'immutable'
import debounce from 'lodash/debounce'
import styled from 'styled-components'
import mock from './mock.json'

const EditorWrapper = styled.div`
  height: 100%;
  overflow: auto;
`

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

class ScrollBounds extends Component {
  constructor(props) {
    super(props)

    this.ref = React.createRef()
    let _scrollTop = null;

    this.onScroll = (event) => {
      const domNode = findDOMNode(this.ref.current)
      const { offset } = this.props
      const { scrollTop, clientHeight, scrollHeight } = domNode

      // scrollHeight - clientHeight
      if (_scrollTop !== null) {
        if (scrollTop === 0 && _scrollTop !== 0) {
          this.props.onTopReached && this.props.onTopReached()
        } else if (scrollTop + clientHeight >= scrollHeight) {
          this.props.onEndReached && this.props.onEndReached()
        }

        if (scrollTop <= offset && _scrollTop >= offset) {
          this.props.onTopOffsetReached && this.props.onTopOffsetReached()
        } else if (scrollHeight - (scrollTop + clientHeight) <= offset && scrollHeight- (_scrollTop + clientHeight) >= offset) {
          this.props.onEndOffsetReached && this.props.onEndOffsetReached()
        }
      }

      _scrollTop = scrollTop
    }
  }


  render() {
    return React.cloneElement(
      this.props.children,
      {
        onScroll: this.onScroll,
        ref: this.ref,
      }
    )
  }
}

ScrollBounds.propTypes = {
  offset: PropTypes.number,
  onTopReached: PropTypes.func,
  onEndReached: PropTypes.func,
  onTopOffsetReached: PropTypes.func,
  onEndOffsetReached: PropTypes.func,
}

ScrollBounds.defaultProps = {
  offset: 500,
}

const frame = 100

/**
 * Return whether a change should be considered a boundary state, given
 * the previous change type. Allows us to discard potential boundary states
 * during standard typing or deletion behavior.
 */
function mustBecomeBoundary(
  editorState,
  changeType,
) {
  var lastChangeType = editorState.getLastChangeType();
  return (
    changeType !== lastChangeType ||
    (changeType !== 'insert-characters' &&
      changeType !== 'backspace-character' &&
      changeType !== 'delete-character')
  );
}

class PaginationState {
  undoStack = Immutable.Stack()
  redoStack = Immutable.Stack()

  constructor(initialState = {}) {
    this.initialState = Immutable.Map({
      index: 0,
      range: 50,
      ...initialState
    })
  }

  set(state = {}) {
    const current = this.undoStack.first() || this.initialState
    const next = current.merge(state)
    this.undoStack = this.undoStack.push(next)
    return this;
  }

  undo() {
    const current = this.undoStack.first()
    if (current != null) {
      this.redoStack = this.redoStack.push(current)
      this.undoStack = this.undoStack.pop()
    }
    return this;
  }

  redo() {
    const current = this.redoStack.first()
    if (current != null) {
      this.undoStack = this.undoStack.push(current)
      this.redoStack = this.redoStack.pop()
    }
    return this;
  }

  getIndex() {
    return this.toJS().index
  }

  getRange() {
    return this.toJS().range
  }

  toJS() {
    const current = this.undoStack.first() || this.initialState
    return current.toJS()
  }
}

class ContentStateProducer extends Component {
  render() {
    return this.props.children({
    })
  }
}

ContentStateProducer.propTypes = {
  fetchRawContent: PropTypes.func.isRequired,
}


class PaginatedEditorState extends Component {
  constructor(props) {
    super(props)
    const { range, index, saveDelay } = this.props

    const pagination = new PaginationState({ range, index })

    this.delayedSave = debounce(this.save, saveDelay)

    this.state = {
      pagination,
      isLoading: false,
      editorState: EditorState.createEmpty()
    }
  }

  onChange = (editorState) => {
    let pagination = this.state.pagination;

    const changeType = editorState._immutable.lastChangeType

    var selection = this.state.editorState.getSelection();
    var currentContent = this.state.editorState.getCurrentContent();

    if (changeType === "undo") {
      pagination = pagination.undo()
    } else if (changeType === "redo") {
      pagination = pagination.redo()
    } else if (
      currentContent !== editorState.getCurrentContent() &&
      (selection !== currentContent.getSelectionAfter() ||
      mustBecomeBoundary(this.state.editorState, changeType))
    ) {
      pagination = pagination.set()
    }

    this.setState({
      editorState,
      pagination
    });

    this.dirty = true
    this.delayedSave()
  };

  save = async () => {
    this.dirty = false
    await this.props.onSave()
  }

  fetchRawContent = async () => {
    this.setState({ isLoading: true })

    const { index, range } = this.state.pagination.toJS()

    const rawContent = await this.props.fetchRawContent(index, range)

    const newContentState = convertFromRaw(rawContent)

    this.setState({
      isLoading: false,
      editorState: EditorState.push(
        this.state.editorState,
        newContentState
      )
    })
  }

  componentDidMount() {
    this.fetchRawContent()
  }

  onChangeIndex = (index) => {
    const oldIndex = this.state.pagination.getIndex()

    if (oldIndex !== index) {
      this.setState({
        pagination: this.state.pagination.set({ index: Number(index) })
      })

      this.fetchRawContent()
    }
  }

  prevPage = async () => {
    if (this.dirty === true) {
      await this.save()
    }

    const { index, range } = this.state.pagination.toJS()
    if (index !== 0) {
      const newIndex = Math.floor(index - range * 0.7)

      this.onChangeIndex(newIndex > 0 ? newIndex : 0)
    }
  }

  nextPage = async () => {
    if (this.dirty === true) {
      await this.save()
    }

    const { totalLineCount } = this.props
    const { index, range } = this.state.pagination.toJS()
    const lastIndex = totalLineCount - range
    if (index !== lastIndex) {
      const newIndex = Math.ceil(index + range * 0.7)

      this.onChangeIndex(newIndex < lastIndex ? newIndex : lastIndex)
    }
  }

  render() {
    const {
      editorState,
      pagination
    } = this.state

    return this.props.children({
      onPrevPage: this.prevPage,
      onNextPage: this.nextPage,
      editorState,
      onChange: this.onChange,
      onChangeIndex: this.onChangeIndex,
      index: pagination.getIndex()
    })
  }
}

PaginatedEditorState.propTypes = {
  fetchRawContent: PropTypes.func.isRequired,
  index: PropTypes.number,
  range: PropTypes.number,
  saveDelay: PropTypes.number,
  onSave: PropTypes.func.isRequired,
  totalLineCount: PropTypes.number.isRequired,
}


PaginatedEditorState.defaultProps = {
  index: 0,
  range: 100,
  saveDelay: 300,
}

class App extends Component {
  fetchRawContent(index, range) {
    return new Promise((resolve) => {
      setTimeout(() => {
        const blocks = mock.blocks.slice(index, index + range)
        const rawContent = {
          ...mock,
          blocks,
        }

        resolve(rawContent)
      }, 100)
    })
  }

  onSave = (index, range, content) => {

  }

  render() {
    return <PaginatedEditorState
      fetchRawContent={this.fetchRawContent}
      totalLineCount={mock.blocks.length}
      onSave={this.onSave}
    >
      {({ editorState, onPrevPage, onNextPage, onChange, index, onChangeIndex, isLoading }) => (
        <Wrapper>
          <ScrollBounds
            offset={800}
            onTopOffsetReached={onPrevPage}
            onEndOffsetReached={onNextPage}
          >
            <EditorWrapper>
              <Editor
                readOnly={isLoading}
                onChange={onChange}
                editorState={editorState}
              />
            </EditorWrapper>
          </ScrollBounds>
          <Pagination>
            <input
              type="number"
              disabled={isLoading}
              value={index}
              onChange={({ target: { value: index } }) => onChangeIndex(index)}
            />
          </Pagination>
        </Wrapper>
      )}
    </PaginatedEditorState>
  }
}

export default App;
