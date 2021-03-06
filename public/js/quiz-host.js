var quizId, 
pubnub;

$(function() {	
	quizId = $('#quiz-id').val();
	hostQuiz.init();   	 
	
	$(window).bind('beforeunload', function() {
		$.ajax({
			type: 'POST',
	        url: '/admin/quiz/' + quizId + '/activate/false'
	    });
    });
});

var hostQuiz = {
	$container: $('div#content'), 
	currentRound: null, 
	currentQuestion: null, 
	counter: null, 
	currentQuestionCount: 0, 
	showingAnswer: false, 
	playingMembers: [],
	$teamList: $('ol.teams'), 
	init: function() {
		var self = this;
		self.setUpNavigation();	
		self.setUpChannel();	
		self.$teamList.mixItUp({
			layout: {
				display: 'block'
			}, 
			selectors: {
				target: 'li'
			}
		});
	}, 
	setUpChannel: function() {
		var self = this;
		pubnub = PUBNUB.init({
			publish_key: 'pub-c-05acf469-af6d-47ad-8387-0d34d02d0d6e',
			subscribe_key: 'sub-c-80adaa22-b46b-11e3-890f-02ee2ddab7fe'
		});
		
		pubnub.subscribe({
			channel: quizId,
			callback: function (message) {
				if(message.type == 1 && message.teamName) {
					self.addTeam(message.teamName);
				}
				else if(message.type == 2 && message.answer) {
					self.logAnswer(message.teamName, message.answer);
				}
				else if(message.type == 6 && message.doublePointsRoundId) {
					self.logDoublePointsRound(message.teamName, message.doublePointsRoundId);
				}
				else if(message.type == 7 && message.team) {
					self.updateTeamScores(message.team);
				}
			},
			connect: function () {	
				$.ajax({
					type: 'POST',
			        url: '/admin/quiz/' + quizId + '/activate/true'
			    });
			}
		});
	}, 
	setUpNavigation: function() {
		var self = this;
		window.addEventListener('keydown', function(e) {			
			if(e.keyCode == 32 || e.keyCode == 34){					
				if(!self.currentRound) {					
					self.getNextRound(0);
				}
				else {
					if(!self.currentQuestion) {
						self.getNextQuestion(0);
					}
					else {
						if(!self.showingAnswer) {
							self.revealAnswer();
						}
						else {
							self.getNextQuestion(self.currentQuestion.displayOrder+1);
						}
					}
				}
				e.preventDefault();
			}
		});
	}, 
	finish: function() {
		var self = this;
		
		self.$container.children().fadeOut(250, function() {
			self.$container.parent().addClass('complete');
			self.$container.css({ 'width': '0', 'padding': '0' });
			$('aside').css({'width': '100%' });
		});
		
		$.ajax({
			type: 'POST',
	        url: '/admin/quiz/' + quizId + '/activate/false'
	    });	        	
	    
    	pubnub.publish({
        	channel: quizId, 
        	message: {
        		type: 5, 
        		teams: self.playingMembers
        	}
    	});	
	}, 
	getNextRound: function(displayOrder) {
		var self = this;
		$.ajax({
			type: 'GET',
	        url: '/admin/quiz/' + quizId + '/rounds/next/' + displayOrder,						
	        success: function(data) {
	        	if(data.message && data.message == '-1') {
	        		self.finish();
				}
	        	else {
					var html = new EJS({url: '/partials/round.ejs'}).render({ round: data });
		        	self.$container.html(html);
		        	self.currentRound = data;		        	
		        	pubnub.publish({
			        	channel: quizId, 
			        	message: {
			        		type: 2, 
			        		round: data
			        	}
		        	});	
	        	}
	        }
	    }); 		
	}, 
	getNextQuestion: function(displayOrder) {
		var self = this;
		self.showingAnswer = false;
		$.ajax({
			type: 'GET',
	        url: '/admin/quiz/' + quizId + '/rounds/' + self.currentRound._id + '/questions/next/' + displayOrder,						
	        success: function(data) {
	        	if(data.message && data.message == '-1') {
	        		self.getNextRound(self.currentRound.displayOrder+1);
	        		self.currentQuestion = null;
				}
				else {
					var html = new EJS({url: '/partials/question.ejs'}).render({ question: data, withAnswer: true });
						
					self.$container.html(html);
					self.currentQuestion = data;
					count = parseInt(data.timeInSeconds);
					clearInterval(hostQuiz.counter);
		        	self.counter = setInterval(self.timer, 1000);
											
					for(var i = 0; i < self.playingMembers.length; i++) {
						self.playingMembers[i].scoreSheet.push(data);
					}
					
		        	pubnub.publish({
			        	channel: quizId, 
			        	message: {
			        		type: 3, 
			        		question: data
			        	}
		        	});			        	
		        				
				}	
	        }
	    }); 		
	}, 
	timer: function() {
		var self = this;
		
		count--;
		
		if(count <= 0) {
			hostQuiz.revealAnswer();
			return;
		}
		
		$('p#timer span').html(count);
	}, 
	revealAnswer: function() {
		var self = this, 
		$answer = self.$container.find('dl.question dd.answer'), 
		answerValue = $answer.text();
		$answer.show();
		clearInterval(hostQuiz.counter);
		$('p#timer').remove();
		self.showingAnswer = true;				
    	pubnub.publish({
        	channel: quizId, 
        	message: {
        		type: 4, 
        		answer: answerValue
        	}
    	});	
    	self.updateTeamList();
	}, 
	addTeam: function(teamName) {
		var self = this, 
		existingTeam = false;
		for(var i = 0; i < self.playingMembers.length; i++) {
			if(self.playingMembers[i].name == teamName) {
				existingTeam = true;
				break;
			}
		}
		if(existingTeam == false) {
			var team = new Team(teamName, self.playingMembers.length+1);
			self.playingMembers.push(team);
			self.$teamList.append('<li data-position="' + team.position + '"><h2>' + team.name + '</h2> <span class="score">' + team.score + '</span></li>');
		}
	}, 
	updateTeamList: function() {
		var self = this;	
		
		self.playingMembers.sort(compare);
		
    	pubnub.publish({
        	channel: quizId, 
        	message: {
        		type: 6, 
        		teams: self.playingMembers
        	}
    	});		
		
		for(var i = 0; i < self.playingMembers.length; i++) {
			var team = self.playingMembers[i];
			team.position = i+1;
			self.$teamList.children('li').each(function(index, value) {
				var $team = $(this);
				if($team.find('h2').html() == team.name) {
					$team.find('span.score').html(team.score);
					$team.attr('data-position', team.position);
				}
			});
		}	
		self.$teamList.mixItUp('sort', 'position:asc');	
	}, 
	updateTeamScores: function(updatedTeam) {
		var self = this;
		
		for(var i = 0; i < self.playingMembers.length; i++) {
			if(self.playingMembers[i].name == updatedTeam.name) {
		    	self.playingMembers[i].score = updatedTeam.score;
				break;
			}
		}	
		
		self.updateTeamList();
	}, 
	logAnswer: function(teamName, answer) {
		var self = this;
		for(var i = 0; i < self.playingMembers.length; i++) {
			if(self.playingMembers[i].name == teamName) {
				self.playingMembers[i].scoreSheet[self.playingMembers[i].scoreSheet.length-1].submittedAnswer = answer;
				self.checkAnswer(teamName);
			}
		}
	}, 
	checkAnswer: function(teamName) {
		var self = this;
		for(var i = 0; i < self.playingMembers.length; i++) {
			if(self.playingMembers[i].name == teamName) {
				var team = self.playingMembers[i], 
				currentQuestion = team.scoreSheet[team.scoreSheet.length-1],
				answers = [currentQuestion.answer.toLowerCase()], 
				results = fuzzy.filter($.trim(currentQuestion.submittedAnswer.toLowerCase()), answers), 
				matches = results.map(function(el) { return el.string; });
				if(matches.length == 1) {
					if(self.currentRound._id == team.doublePointsRoundId) {
						team.score = team.score + (currentQuestion.points*2);
					}
					else {
						team.score = team.score + currentQuestion.points;
					}
				}
				else {
					currentQuestion.correct = false;
				}
			}
		}		
	}, 
	logDoublePointsRound: function(teamName, roundId) {
		var self = this;
		for(var i = 0; i < self.playingMembers.length; i++) {
			if(self.playingMembers[i].name == teamName && self.playingMembers[i].doublePointsRoundId == 0) {
				self.playingMembers[i].doublePointsRoundId = roundId;
			}
		}		
	}
}

var count = 0;

function Team(name, position) {
	this.name = name || "";
	this.score = 0;
	this.scoreSheet = [];
	this.position = position || 0;
	this.doublePointsRoundId = 0;
}

function compare(a,b) {
	if (a.score > b.score)
	 return -1;
	if (a.score < b.score)
	return 1;
	return 0;
}