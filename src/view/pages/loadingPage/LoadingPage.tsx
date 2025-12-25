import styles from './loadingPage.module.scss';

const LoadingPage = () => {
	return (
		<div className={styles['loading-page']}>
			<div className={styles['loading-page__content']}>
				<h1 className={styles['loading-page__brand']}>WizCol</h1>
				<p className={styles['loading-page__tagline']}>
					Empowering collective decisions
				</p>

				<div
					className={styles['constellation-loader']}
					role="img"
					aria-label="Loading animation"
				>
					<div className={styles['constellation-loader__ring']} />
					<div className={styles['constellation-loader__center']} />
					<div className={styles['constellation-loader__node']} />
					<div className={styles['constellation-loader__node']} />
					<div className={styles['constellation-loader__node']} />
					<div className={styles['constellation-loader__node']} />
					<div className={styles['constellation-loader__node']} />
					<div className={styles['constellation-loader__node']} />
					<div className={styles['constellation-loader__connections']} />
				</div>

				<p className={styles['loading-page__status']}>
					Loading your workspace...
				</p>

				<div className={styles['loading-progress']}>
					<div className={styles['loading-progress__bar-container']}>
						<div
							className={styles['loading-progress__bar']}
							role="progressbar"
							aria-label="Loading progress"
						/>
					</div>
				</div>
			</div>
		</div>
	);
};

export default LoadingPage;
