import React from 'react'
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome'
import {faGithub} from '@fortawesome/free-brands-svg-icons'
import styles from './Links.module.css'

const Links = () => (
  <div className={styles.links}>
    <a
      href="https://github.com/TimoSta/sprite"
      title="Sprite on GitHub"
      target="_new"
      className={styles.item}
    >
      <FontAwesomeIcon icon={faGithub} />
    </a>
  </div>
)

export default Links
