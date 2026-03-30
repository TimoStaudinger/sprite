import React, {useCallback} from 'react'
import {SplitPane, Pane} from 'react-split-pane'
import useDeviceInfo from './util/useDeviceInfo'
import useUrlState from './util/useUrlState'
import {onEditorInput} from './util/chartTiming'
import {Header} from './header'
import {Editor} from './editor'
import {Preview} from './preview'
import MobileWarning from './MobileWarning'
import defaultCode from './defaultCode'
import styles from './App.module.css'

const App = () => {
  const [code, setCode] = useUrlState(defaultCode, '/edit')

  const handleEditorChange = useCallback(
    (value: string) => {
      onEditorInput()
      setCode(value)
    },
    [setCode]
  )

  const {isPortrait} = useDeviceInfo()

  return (
    <div className={styles.app}>
      <Header code={code} />

      <div className={styles.body}>
        <SplitPane
          direction={isPortrait ? 'vertical' : 'horizontal'}
        >
          <Pane defaultSize="50%" style={{overflow: 'hidden'}}>
            <Editor code={code} onChange={handleEditorChange} />
          </Pane>
          <Pane style={{overflow: 'hidden'}}>
            <Preview code={code} />
          </Pane>
        </SplitPane>
      </div>

      <MobileWarning />
    </div>
  )
}

export default App
