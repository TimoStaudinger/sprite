import React, {useState, useEffect} from 'react'
import {encode} from '../util/code'
import styles from './Render.module.css'

interface Props {
  code: string
}
const Render = ({code}: Props) => {
  const [loading, setLoading] = useState(true)
  const [debouncedCode, setDebouncedCode] = useState(code)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCode(code)
    }, 300)
    return () => clearTimeout(timer)
  }, [code])

  useEffect(
    () => {
      setLoading(true)
    },
    [debouncedCode]
  )

  const encoded = encode(debouncedCode)

  return (
    <img
      className={`${styles.render} ${loading ? styles.loading : ''}`}
      src={`/chart/${encoded}.png`}
      alt="Chart preview"
      onLoad={() => setLoading(false)}
    />
  )
}

export default Render
