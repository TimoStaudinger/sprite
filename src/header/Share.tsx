import React, {useRef, useState} from 'react'
import {encode} from '../util/code'
import styles from './Share.module.css'

const {location} = window
const domain = `${location.protocol}//${location.hostname}${
  location.port ? `:${location.port}` : ''
}`

interface Props {
  code: string
}

const Share = ({code}: Props) => {
  const inputEl = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)

  const url = `${domain}/chart/${encode(code)}.png`

  const handleCopy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className={styles.share}>
      <label className={styles.label} htmlFor="shareLink">
        Embed as PNG:
      </label>
      <input
        id="shareLink"
        readOnly
        value={url}
        ref={inputEl}
        onFocus={() => inputEl.current && inputEl.current.select()}
      />
      <button className={styles.copyButton} onClick={handleCopy}>
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}

export default Share
