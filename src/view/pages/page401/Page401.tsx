import './page401.scss';
import { useNavigate } from 'react-router';
import UnAuthorizedImage from '@/assets/images/401-img.png';
import UnAuthorizedErrorImage from '@/assets/images/401-error.png';

const Page401 = () => {
	const navigate = useNavigate();

	function handleGoHome() {
		navigate('/', { state: { from: window.location.pathname } });
	}

	return (
		<div className='page401'>
			<img
				className='page401__titleImg'
				src={UnAuthorizedErrorImage}
				alt='Title 404 Img'
			/>
			<img
				className='page401__img'
				src={UnAuthorizedImage}
				alt='Un-authorized image'
			/>
			<p className='page401__stamp'>
				From the Institute for Deliberative Democracy
			</p>
			<button className='page401__btn' onClick={handleGoHome}>
				Go to Homepage
			</button>
		</div>
	);
};

export default Page401;
