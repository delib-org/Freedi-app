import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './ThankYou.module.scss';
import Dove from '@/assets/images/SubscriptionThanks.png';

const ThankYou = () => {
    const { t } = useUserConfig();
    
    return (
        <div className={styles.thanks}>
            <img src={Dove} alt="a dove that says thanks" />
            <h2>{t("Thank you for the registration")}</h2>
            <p>{t("You have successfully registered to receive updates. We will send you a message when there is news.")}</p>
            <a href="https://delib.org" className="btn btn--primary">{t("Deliberative Democracy Institute")}</a>
        </div>
    )
}

export default ThankYou