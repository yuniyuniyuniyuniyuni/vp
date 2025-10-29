import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

function SelectStudyPage() {

	const [userData, setUserData] = useState(null);
	const navigate = useNavigate();


	useEffect(() => {
		const fetchUserData = async () => {

			const { data: { user } } = await supabase.auth.getUser();

			if (user) {

				setUserData({
					name: user.user_metadata.name || user.email,
					picture: user.user_metadata.picture
				});
			} else {

				console.log("No user found, redirecting to home.");
				navigate('/');
			}
		};

		fetchUserData();
	}, [navigate]);


	const handleLogout = async () => {
		const { error } = await supabase.auth.signOut();
		if (error) {
			console.error("Error logging out:", error.message);
		}


		navigate('/');
	};

	return (
		<div className="page-layout-full">
			<header className="page-header">
				<div className="container">
					<Link to="/" className="logo-lg">
						NO<span className='blue-doze'>DOZE</span>
					</Link>
					{userData && (
						<div className="profile-section">
							<div className="profile-info">
								<div className="user-avatar">
									{userData.picture && <img src={userData.picture} alt="avatar" />}
								</div>
								<div>
									<div className="user-name">{userData.name}</div>
									<button onClick={handleLogout} className="logout-link">
										로그아웃
									</button>
								</div>
							</div>
						</div>
					)}
				</div>
			</header>

			<main className="select-study-main">
				<h1 className="welcome-title">안녕하세요 {userData ? userData.name : '...'}님!</h1>
				<p className="welcome-subtitle">오늘은 어떤 모드로 스터디를 시작하시겠어요?</p>

				<div className="selection-card-area">
					<div className="selection-card selected">
						<div className="card-icon-placeholder">
							<img src='solo.jpeg'></img>
						</div>
						<h2 className="card-title">개인 스터디</h2>
						<p className="card-description">
							AI가 당신의 학습을 1:1로 관리해줍니다.<br />
							오직 순공시간에만 집중해보세요!
						</p>
						<Link to="/study" className="btn btn-primary">
							시작하기
						</Link>
					</div>
					<div className="selection-card">
						<div className="card-icon-placeholder">
							<img className='group-study-icon' src='groupstudy.jpeg'></img>
						</div>
						<h2 className="card-title">그룹 스터디</h2>
						<p className="card-description">
							친구들과 함께 공부하고<br />
							랭킹 확인해서 선물 받아가세요!
						</p>
						<Link to="/groups" className="btn btn-primary">
							시작하기
						</Link>
					</div>

				</div>
			</main>
		</div>
	);
}

export default SelectStudyPage;