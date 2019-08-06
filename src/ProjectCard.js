import React from 'react';

import Button from '@material-ui/core/Button';
import Card from '@material-ui/core/Card';
import CardActions from '@material-ui/core/CardActions';
import CardContent from '@material-ui/core/CardContent';
import CardMedia from '@material-ui/core/CardMedia';
import Grid from '@material-ui/core/Grid';
import Typography from '@material-ui/core/Typography';
import { withStyles } from '@material-ui/core/styles';

const styles = theme => ({
  card: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  cardMedia: {
    paddingTop: '56.25%', // 16:9
  },
  cardContent: {
    flexGrow: 1,
  },
});

class ProjectCard extends React.Component {
  render() {
    const {classes} = this.props;

    return (
      <Grid item xs={12} sm={6} md={4}>
        <Card className={classes.card}>
          <CardMedia
            className={classes.cardMedia}
            image={this.props.image}
            title={this.props.imageTitle}
          />
          <CardContent className={classes.cardContent}>
            <Typography gutterBottom variant="h5" component="h2">
              {this.props.header}
            </Typography>
            <Typography>
              {this.props.children}
            </Typography>
          </CardContent>
          <CardActions>
            <Button size="small" color="primary" href={this.props.viewHref} target="_blank">
              View
            </Button>
          </CardActions>
        </Card>
      </Grid>
    );
  }
}

export default withStyles(styles)(ProjectCard);
