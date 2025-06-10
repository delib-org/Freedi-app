import { Statement } from 'delib-npm'
import { FC } from 'react'
import styles from './Joined.module.scss'
import ProfileImage from '../profileImage/ProfileImage'

interface Props {
	statement: Statement
}

const Joined: FC<Props> = ({ statement }) => {
	return (
		<div className={styles.joined}>
			{statement.joined.map(c => (
				<ProfileImage key={c.uid} creator={c} isSmall={true} />
			))}
		</div>
	)
}

export default Joined